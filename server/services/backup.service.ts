/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { config } from "../config";
import { logger } from "../logger";
import { db } from "../database";
import { photoStorageService } from "./photo-storage.service";

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
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor() {
    this.backupDirectory = path.resolve(config.backup.directory);
    this.snapshotsDirectory = path.join(this.backupDirectory, "snapshots");
    this.photosBackupDirectory = path.join(this.backupDirectory, "photos");
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
