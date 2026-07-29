/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../config";
import { logger } from "../logger";
import { db } from "../database";
import { photoStorageService } from "./photo-storage.service";
import { BackupCheckpoint, RestoreResult, DatabaseSchema } from "../models";

/**
 * Summary of a single backup run, returned for logging and (optionally)
 * surfacing to an administrator via the UI in the future.
 */
export interface BackupResult {
  snapshotPath: string;
  newPhotosBackedUp: number;
  mirroredToGoogleDrive: boolean;
  timestamp: string;
}

/**
 * Automated Backup Service.
 *
 * Protects against total data loss by periodically writing a complete,
 * timestamped snapshot of the farm database (and any new field-observation
 * photos) to a local `backups/` directory, with automatic retention
 * pruning so the folder never grows without bound. When a local Google
 * Drive for Desktop synced folder is configured (`GOOGLE_DRIVE_BACKUP_PATH`),
 * every backup is additionally mirrored into that folder — Google Drive's
 * own client then uploads it to the cloud automatically. This approach
 * requires no Google API credentials, OAuth setup, or extra dependencies.
 *
 * Backups are also consulted by `DatabaseManager` as a recovery source if
 * the primary database file is ever found to be corrupted on startup.
 */
export class BackupService {
  private readonly backupDirectory: string;
  private readonly snapshotsDirectory: string;
  private readonly photosBackupDirectory: string;
  /** Sprint 3A — manuel checkpoint meta-verisinin tutulduğu indeks dosyası. */
  private readonly checkpointsIndexPath: string;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor() {
    this.backupDirectory = path.resolve(config.backup.directory);
    this.snapshotsDirectory = path.join(this.backupDirectory, "snapshots");
    this.photosBackupDirectory = path.join(this.backupDirectory, "photos");
    this.checkpointsIndexPath = path.join(this.backupDirectory, "checkpoints.json");
    this.ensureDirectoriesExist();
  }

  /**
   * Ensures the local backup directory structure exists, creating any
   * missing folders.
   */
  private ensureDirectoriesExist(): void {
    for (const dir of [this.backupDirectory, this.snapshotsDirectory, this.photosBackupDirectory]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Starts the automatic backup schedule: performs one backup immediately
   * (providing a fresh safety checkpoint as soon as the server starts),
   * then repeats every `config.backup.intervalHours`. Safe to call once
   * at application startup; failures during any individual run are
   * logged but never crash the server.
   */
  public startAutomaticBackupSchedule(): void {
    this.runBackupSafely();

    const intervalMs = config.backup.intervalHours * 60 * 60 * 1000;
    this.intervalHandle = setInterval(() => this.runBackupSafely(), intervalMs);

    logger.info(
      "DATABASE",
      `Otomatik yedekleme zamanlayıcısı başlatıldı. Her ${config.backup.intervalHours} saatte bir yedek alınacak.`,
      { backupDirectory: this.backupDirectory, googleDriveEnabled: !!config.backup.googleDriveSyncPath }
    );
  }

  /**
   * Stops the automatic backup schedule, if running. Provided for clean
   * shutdown scenarios (e.g. tests or graceful process termination).
   */
  public stopAutomaticBackupSchedule(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Runs a full backup and swallows any error so a failed backup attempt
   * (e.g. a temporarily unavailable Google Drive folder) never disrupts
   * normal application operation.
   */
  private async runBackupSafely(): Promise<void> {
    try {
      const result = await this.createBackup();
      logger.info(
        "DATABASE",
        `Otomatik yedekleme tamamlandı: ${path.basename(result.snapshotPath)} | Yeni fotoğraf: ${result.newPhotosBackedUp} | Google Drive senkronizasyonu: ${result.mirroredToGoogleDrive ? "aktif" : "kapalı"}`
      );
    } catch (error) {
      logger.error("DATABASE", "Otomatik yedekleme işlemi sırasında bir hata oluştu.", error);
    }
  }

  /**
   * Creates a single complete backup: a timestamped JSON snapshot of the
   * current database state, plus any field-observation photo files not
   * already present in the photo backup mirror. Prunes old snapshots
   * beyond the configured retention limit afterward.
   * @returns Summary of what was backed up
   * @throws Error if the snapshot file cannot be written
   */
  public async createBackup(): Promise<BackupResult> {
    this.ensureDirectoriesExist();

    const timestamp = new Date().toISOString();
    const safeTimestamp = timestamp.replace(/[:.]/g, "-");
    const snapshotFileName = `tarim_hafizasi_${safeTimestamp}.json`;

    const rawDb = await db.readRaw();
    const serialized = JSON.stringify(rawDb, null, 2);

    const localSnapshotPath = path.join(this.snapshotsDirectory, snapshotFileName);
    this.writeFileAtomically(localSnapshotPath, serialized);

    let mirroredToGoogleDrive = false;
    if (config.backup.googleDriveSyncPath) {
      mirroredToGoogleDrive = this.mirrorSnapshotToGoogleDrive(snapshotFileName, serialized);
    }

    const newPhotosBackedUp = this.mirrorNewPhotos();

    this.pruneOldSnapshots(this.snapshotsDirectory);
    if (config.backup.googleDriveSyncPath) {
      const driveSnapshotsDir = path.join(config.backup.googleDriveSyncPath, "snapshots");
      this.pruneOldSnapshots(driveSnapshotsDir);
    }

    return {
      snapshotPath: localSnapshotPath,
      newPhotosBackedUp,
      mirroredToGoogleDrive,
      timestamp,
    };
  }

  /**
   * Writes the same snapshot content into the configured Google Drive
   * synced folder, if it currently exists and is accessible. Failures
   * here (e.g. Google Drive for Desktop temporarily not running) are
   * logged as warnings rather than thrown, since local backups already
   * succeeded and cloud mirroring is a best-effort enhancement.
   * @returns true if the mirror write succeeded
   */
  private mirrorSnapshotToGoogleDrive(snapshotFileName: string, serialized: string): boolean {
    try {
      const driveRoot = config.backup.googleDriveSyncPath;
      if (!fs.existsSync(driveRoot)) {
        logger.warn(
          "DATABASE",
          `Google Drive senkronizasyon klasörü bulunamadı, bulut yedeklemesi bu seferlik atlandı: ${driveRoot}`
        );
        return false;
      }

      const driveSnapshotsDir = path.join(driveRoot, "snapshots");
      if (!fs.existsSync(driveSnapshotsDir)) {
        fs.mkdirSync(driveSnapshotsDir, { recursive: true });
      }

      const driveSnapshotPath = path.join(driveSnapshotsDir, snapshotFileName);
      this.writeFileAtomically(driveSnapshotPath, serialized);
      return true;
    } catch (error) {
      logger.error("DATABASE", "Google Drive klasörüne yedek yazılırken bir hata oluştu.", error);
      return false;
    }
  }

  /**
   * Copies any photo files not yet present in the local (and, if
   * configured, Google Drive) photo backup mirror. Photos are immutable
   * once created, so this only ever needs to copy files that are
   * genuinely new since the last backup run — existing backed-up photos
   * are never re-read or re-copied, keeping this operation fast even as
   * the photo collection grows large.
   * @returns The number of newly copied photo files
   */
  private mirrorNewPhotos(): number {
    const sourceDir = photoStorageService.getPhotosDirectoryPath();
    if (!fs.existsSync(sourceDir)) {
      return 0;
    }

    const sourceFiles = fs.readdirSync(sourceDir);
    let copiedCount = 0;

    for (const fileName of sourceFiles) {
      const sourcePath = path.join(sourceDir, fileName);
      if (!fs.statSync(sourcePath).isFile()) continue;

      const localDestPath = path.join(this.photosBackupDirectory, fileName);
      if (!fs.existsSync(localDestPath)) {
        fs.copyFileSync(sourcePath, localDestPath);
        copiedCount++;
      }

      if (config.backup.googleDriveSyncPath && fs.existsSync(config.backup.googleDriveSyncPath)) {
        const drivePhotosDir = path.join(config.backup.googleDriveSyncPath, "photos");
        if (!fs.existsSync(drivePhotosDir)) {
          fs.mkdirSync(drivePhotosDir, { recursive: true });
        }
        const driveDestPath = path.join(drivePhotosDir, fileName);
        if (!fs.existsSync(driveDestPath)) {
          fs.copyFileSync(sourcePath, driveDestPath);
        }
      }
    }

    return copiedCount;
  }

  /**
   * Deletes the oldest snapshot files in the given directory beyond the
   * configured retention limit (`config.backup.maxSnapshotsToKeep`),
   * keeping the most recent ones. Missing directories are silently
   * ignored, since a Google Drive folder may not yet exist on a given run.
   */
  private pruneOldSnapshots(directory: string): void {
    try {
      if (!fs.existsSync(directory)) return;

      const snapshotFiles = fs
        .readdirSync(directory)
        .filter((name) => name.startsWith("tarim_hafizasi_") && name.endsWith(".json"))
        .sort(); // ISO-safe timestamp filenames sort chronologically as plain strings

      const excessCount = snapshotFiles.length - config.backup.maxSnapshotsToKeep;
      if (excessCount <= 0) return;

      const filesToDelete = snapshotFiles.slice(0, excessCount);
      for (const fileName of filesToDelete) {
        fs.unlinkSync(path.join(directory, fileName));
      }

      logger.info("DATABASE", `Saklama süresi dolan ${filesToDelete.length} eski yedek dosyası temizlendi.`, { directory });
    } catch (error) {
      logger.error("DATABASE", "Eski yedek dosyaları temizlenirken bir hata oluştu.", error, { directory });
    }
  }

  /**
   * Sprint 3A — Manuel Checkpoint oluşturma.
   *
   * Mevcut `createBackup()`'ı OLDUĞU GİBİ çağırır (yedekleme mantığının
   * kendisi hiç tekrar yazılmadı) — yalnızca üzerine, kullanıcının
   * verdiği bir etiketi, kim oluşturduğunu ve SHA-256 checksum'ını
   * ekleyen bir meta-veri kaydı oluşturur.
   */
  public async createManualCheckpoint(label: string, createdBy: string): Promise<BackupCheckpoint> {
    const backupResult = await this.createBackup();
    const snapshotFileName = path.basename(backupResult.snapshotPath);
    const fileBuffer = fs.readFileSync(backupResult.snapshotPath);

    const checkpoint: BackupCheckpoint = {
      id: crypto.randomUUID(),
      label,
      createdBy,
      createdAt: backupResult.timestamp,
      snapshotFileName,
      fileSizeBytes: fileBuffer.length,
      checksum: this.computeChecksum(fileBuffer),
    };

    const existingCheckpoints = this.readCheckpointsIndex();
    existingCheckpoints.push(checkpoint);
    this.writeFileAtomically(this.checkpointsIndexPath, JSON.stringify(existingCheckpoints, null, 2));

    logger.info("DATABASE", `Manuel checkpoint oluşturuldu: '${label}' (${createdBy})`, { checkpointId: checkpoint.id });
    return checkpoint;
  }

  /**
   * Sprint 3A — Checkpoint listeleme. En yeni checkpoint en başta.
   */
  public listCheckpoints(): BackupCheckpoint[] {
    return this.readCheckpointsIndex().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Sprint 3A — Checkpoint Doğrulama.
   *
   * Bir checkpoint'in işaret ettiği snapshot dosyasının hâlâ diskte
   * var olduğunu VE içeriğinin oluşturulduğu andaki SHA-256 checksum'ıyla
   * birebir eşleştiğini (yani dosyanın o tarihten beri hiç
   * değişmediğini/bozulmadığını) doğrular. Geri yükleme (Sprint 3B),
   * bu kontrolü geri yüklemeden ÖNCE zorunlu bir ön koşul olarak
   * kullanacak.
   */
  public verifyCheckpoint(checkpointId: string): { valid: boolean; reason?: string } {
    const checkpoint = this.readCheckpointsIndex().find((c) => c.id === checkpointId);
    if (!checkpoint) {
      return { valid: false, reason: "Checkpoint kaydı bulunamadı." };
    }

    const snapshotPath = path.join(this.snapshotsDirectory, checkpoint.snapshotFileName);
    if (!fs.existsSync(snapshotPath)) {
      return { valid: false, reason: "Checkpoint'in işaret ettiği yedek dosyası diskte bulunamadı (silinmiş olabilir)." };
    }

    const fileBuffer = fs.readFileSync(snapshotPath);
    const actualChecksum = this.computeChecksum(fileBuffer);
    if (actualChecksum !== checkpoint.checksum) {
      return { valid: false, reason: "Dosya bütünlüğü doğrulanamadı: checksum uyuşmuyor (dosya bozulmuş veya değiştirilmiş olabilir)." };
    }

    try {
      JSON.parse(fileBuffer.toString("utf8"));
    } catch {
      return { valid: false, reason: "Dosya geçerli bir JSON formatında değil." };
    }

    return { valid: true };
  }

  /**
   * Sprint 3B — Manuel Geri Yükleme (Restore).
   *
   * Akış (talimattaki tüm kapsamı karşılayacak şekilde):
   * 1. Hedef checkpoint'in bütünlüğü doğrulanır (`verifyCheckpoint` —
   *    mevcut, yeniden kullanılıyor). Doğrulama başarısız olursa geri
   *    yükleme YAPILMAZ.
   * 2. Geri yüklemeden HEMEN ÖNCE, mevcut durumun otomatik bir güvenlik
   *    checkpoint'i alınır (`createManualCheckpoint` — mevcut, yeniden
   *    kullanılıyor). Bu, geri yüklemenin kendisi bir hataysa bile
   *    veri kaybı olmamasını garanti eder.
   * 3. Checkpoint'in işaret ettiği snapshot dosyası okunup, `db`'nin
   *    KENDİ `transaction()` mekanizmasıyla (yeni bir veritabanı yazma
   *    yolu İCAT EDİLMEDİ) canlı veritabanının yerine geçirilir.
   * 4. Geri yükleme öncesi/sonrası kayıt sayıları karşılaştırılarak
   *    temel bir veri bütünlüğü raporu üretilir.
   */
  public async restoreFromCheckpoint(checkpointId: string, restoredBy: string): Promise<RestoreResult> {
    const verification = this.verifyCheckpoint(checkpointId);
    if (!verification.valid) {
      throw new Error(`Geri yükleme reddedildi — checkpoint bütünlüğü doğrulanamadı: ${verification.reason}`);
    }

    const checkpoint = this.readCheckpointsIndex().find((c) => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error("Checkpoint kaydı bulunamadı.");
    }

    // Güvenlik ağı: geri yüklemeden hemen önce, mevcut durumu kaybetmemek
    // için otomatik bir checkpoint alınır.
    const safetyCheckpoint = await this.createManualCheckpoint(
      `Otomatik güvenlik yedeği ('${checkpoint.label}' geri yüklemesinden hemen önce)`,
      restoredBy
    );

    const recordCountsBefore = this.countTopLevelRecords(await db.readRaw());

    const snapshotPath = path.join(this.snapshotsDirectory, checkpoint.snapshotFileName);
    let restoredData: DatabaseSchema;
    try {
      restoredData = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    } catch (error) {
      throw new Error("Checkpoint dosyası geçerli bir JSON formatında değil, geri yükleme durduruldu.");
    }

    await db.transaction((liveDb) => {
      for (const key of Object.keys(liveDb)) {
        delete (liveDb as any)[key];
      }
      Object.assign(liveDb, restoredData);
    });

    const recordCountsAfter = this.countTopLevelRecords(await db.readRaw());

    logger.info(
      "DATABASE",
      `Geri yükleme tamamlandı: '${checkpoint.label}' (${restoredBy}). Güvenlik checkpoint'i: ${safetyCheckpoint.id}`
    );

    return {
      success: true,
      restoredCheckpointId: checkpointId,
      safetyCheckpointId: safetyCheckpoint.id,
      recordCountsBefore,
      recordCountsAfter,
    };
  }

  /** Veri bütünlüğü karşılaştırması için, üst düzey her tablonun kayıt sayısını çıkarır. */
  private countTopLevelRecords(data: DatabaseSchema): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) counts[key] = value.length;
    }
    return counts;
  }

  /**
   * Sprint 3C — İçe Aktarma.
   *
   * Kullanıcının kendi diskinden yüklediği bir yedek dosyasını, sisteme
   * YENİ bir checkpoint olarak kaydeder. Dosya önce JSON geçerliliği
   * açısından doğrulanır (bozuk/alakasız bir dosyanın sisteme
   * girmesini önlemek için) — yalnızca bundan SONRA snapshot'lar
   * klasörüne kopyalanıp indekse eklenir. Bu, henüz GERİ YÜKLEME
   * yapmaz — yalnızca dosyayı, kullanıcının daha sonra bilinçli olarak
   * seçip `restoreFromCheckpoint()` ile geri yükleyebileceği bir
   * checkpoint haline getirir.
   */
  public async importCheckpointFromFile(fileBuffer: Buffer, label: string, importedBy: string): Promise<BackupCheckpoint> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileBuffer.toString("utf8"));
    } catch {
      throw new Error("Yüklenen dosya geçerli bir JSON formatında değil.");
    }
    if (typeof parsed !== "object" || parsed === null || !("parcels" in parsed)) {
      throw new Error("Yüklenen dosya, geçerli bir Mersin AgriTech yedek dosyası gibi görünmüyor.");
    }

    this.ensureDirectoriesExist();
    const safeTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotFileName = `tarim_hafizasi_ithal_${safeTimestamp}.json`;
    const snapshotPath = path.join(this.snapshotsDirectory, snapshotFileName);
    this.writeFileAtomically(snapshotPath, fileBuffer.toString("utf8"));

    const checkpoint: BackupCheckpoint = {
      id: crypto.randomUUID(),
      label,
      createdBy: importedBy,
      createdAt: new Date().toISOString(),
      snapshotFileName,
      fileSizeBytes: fileBuffer.length,
      checksum: this.computeChecksum(fileBuffer),
    };

    const existingCheckpoints = this.readCheckpointsIndex();
    existingCheckpoints.push(checkpoint);
    this.writeFileAtomically(this.checkpointsIndexPath, JSON.stringify(existingCheckpoints, null, 2));

    logger.info("DATABASE", `Dışarıdan bir yedek dosyası içe aktarıldı: '${label}' (${importedBy})`, { checkpointId: checkpoint.id });
    return checkpoint;
  }

  /**
   * Sprint 3C — Dışa Aktarma. Bir checkpoint'in snapshot dosyasının tam
   * yolunu döner (route katmanı bunu indirilebilir bir dosya olarak
   * sunar) — yeni bir dosya oluşturmaz, mevcut dosyayı olduğu gibi işaret eder.
   */
  public getCheckpointFilePath(checkpointId: string): string | null {
    const checkpoint = this.readCheckpointsIndex().find((c) => c.id === checkpointId);
    if (!checkpoint) return null;
    const snapshotPath = path.join(this.snapshotsDirectory, checkpoint.snapshotFileName);
    return fs.existsSync(snapshotPath) ? snapshotPath : null;
  }

  /** SHA-256 checksum — projede zaten kurulu standart (doküman/fotoğraf/chunk içerik özetiyle aynı desen), yeni bağımlılık gerektirmiyor. */
  private computeChecksum(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /** Checkpoint indeks dosyasını okur; dosya yoksa veya bozuksa boş liste döner (asla hata fırlatmaz). */
  private readCheckpointsIndex(): BackupCheckpoint[] {
    if (!fs.existsSync(this.checkpointsIndexPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.checkpointsIndexPath, "utf8"));
    } catch (error) {
      logger.error("DATABASE", "Checkpoint indeks dosyası okunamadı, boş liste ile devam ediliyor.", error);
      return [];
    }
  }

  /**
   * Writes file content to disk using an atomic write-then-rename
   * pattern, preventing a truncated or corrupted backup file if the
   * process is interrupted mid-write.
   */
  private writeFileAtomically(filePath: string, content: string): void {
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, content, "utf8");
    fs.renameSync(tempPath, filePath);
  }
}

export const backupService = new BackupService();
