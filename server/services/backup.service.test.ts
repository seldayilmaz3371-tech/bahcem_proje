/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 6C — BackupService Veri Bütünlüğü Test Süiti.
 *
 * KAPSAM: checkpoint oluşturma (P0), verifyCheckpoint (P0),
 * restoreFromCheckpoint (P0), pruneOldSnapshots/retention (P1),
 * importCheckpointFromFile (P1).
 *
 * İZOLASYON: `database.test.ts` ile aynı strateji — her test kendi
 * `os.mkdtempSync` geçici dizinini oluşturur, `DATABASE_PATH`,
 * `BACKUP_DIR`, `PHOTOS_STORAGE_DIR` ortam değişkenlerini bu dizine
 * yönlendirir, `vi.resetModules()` ile hem `database.ts` hem
 * `backup.service.ts`'i (ikisi de modül-seviyesi singleton) taze yükler.
 * Gerçek dosya I/O kullanılır — gerçek `data/`/`backups/`'a dokunulmaz.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

let tmpDir: string;

function setEnv() {
  process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
  process.env.BACKUP_DIR = path.join(tmpDir, "backups");
  process.env.PHOTOS_STORAGE_DIR = path.join(tmpDir, "photos");
  process.env.SEED_SAMPLE_DATA = "false";
  process.env.BACKUP_MAX_SNAPSHOTS = "30";
}

/** database.ts + backup.service.ts'i taze, izole bir ortamda yükler. */
async function freshBackupModule() {
  vi.resetModules();
  setEnv();
  const { db } = await import("../database");
  const { backupService } = await import("./backup.service");
  return { db, backupService };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "s6c-backup-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATABASE_PATH;
  delete process.env.BACKUP_DIR;
  delete process.env.PHOTOS_STORAGE_DIR;
  delete process.env.SEED_SAMPLE_DATA;
  delete process.env.BACKUP_MAX_SNAPSHOTS;
});

// =======================================================================
// CHECKPOINT OLUŞTURMA — P0
// =======================================================================
describe("BackupService.createManualCheckpoint / createBackup", () => {
  it("checkpoint oluşturma, diskte gerçek bir snapshot dosyası üretir", async () => {
    const { backupService } = await freshBackupModule();

    const checkpoint = await backupService.createManualCheckpoint("Test Checkpoint", "test-user");

    expect(checkpoint.id).toBeTruthy();
    expect(checkpoint.label).toBe("Test Checkpoint");
    const snapshotPath = path.join(tmpDir, "backups", "snapshots", checkpoint.snapshotFileName);
    expect(fs.existsSync(snapshotPath)).toBe(true);
  });

  it("checkpoint listede görünür, en yeni en başta sıralanır", async () => {
    const { backupService } = await freshBackupModule();

    const first = await backupService.createManualCheckpoint("Birinci", "test-user");
    await new Promise((r) => setTimeout(r, 10));
    const second = await backupService.createManualCheckpoint("İkinci", "test-user");

    const list = backupService.listCheckpoints();
    expect(list[0].id).toBe(second.id);
    expect(list.some((c) => c.id === first.id)).toBe(true);
  });
});

// =======================================================================
// VERIFYCHECKPOINT — P0
// =======================================================================
describe("BackupService.verifyCheckpoint", () => {
  it("yeni oluşturulmuş bir checkpoint geçerli olarak doğrulanır", async () => {
    const { backupService } = await freshBackupModule();
    const checkpoint = await backupService.createManualCheckpoint("Geçerli", "test-user");

    const result = backupService.verifyCheckpoint(checkpoint.id);
    expect(result.valid).toBe(true);
  });

  it("olmayan bir checkpoint id'si için geçersiz sonuç döner", async () => {
    const { backupService } = await freshBackupModule();
    const result = backupService.verifyCheckpoint("hic-var-olmayan-id");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("bulunamadı");
  });

  it("snapshot dosyası diskten silinmişse (checkpoint kaydı hâlâ dursa bile) geçersiz sayılır", async () => {
    const { backupService } = await freshBackupModule();
    const checkpoint = await backupService.createManualCheckpoint("Silinecek", "test-user");
    const snapshotPath = path.join(tmpDir, "backups", "snapshots", checkpoint.snapshotFileName);
    fs.unlinkSync(snapshotPath);

    const result = backupService.verifyCheckpoint(checkpoint.id);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("bulunamadı");
  });

  it("snapshot dosyasının içeriği bozulmuşsa (checksum uyuşmazlığı) geçersiz sayılır", async () => {
    const { backupService } = await freshBackupModule();
    const checkpoint = await backupService.createManualCheckpoint("Bozulacak", "test-user");
    const snapshotPath = path.join(tmpDir, "backups", "snapshots", checkpoint.snapshotFileName);
    fs.writeFileSync(snapshotPath, "BU ICERIK KASITLI OLARAK DEGISTIRILDI");

    const result = backupService.verifyCheckpoint(checkpoint.id);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("checksum");
  });
});

// =======================================================================
// RESTOREFROMCHECKPOINT — P0
// =======================================================================
describe("BackupService.restoreFromCheckpoint", () => {
  it("geçerli bir checkpoint'ten başarıyla geri yükleme yapar, veri sayıları raporlanır", async () => {
    const { db, backupService } = await freshBackupModule();

    // Checkpoint anındaki durumu kaydet.
    const checkpoint = await backupService.createManualCheckpoint("Restore Öncesi", "test-user");

    // Checkpoint sonrası veriyi değiştir (yeni bir parsel ekle).
    await db.transaction((data) => {
      data.parcels.push({
        id: "checkpoint-sonrasi-eklenen",
        name: "Sonradan Eklenen",
        cropType: "Zeytin",
        areaDekar: 1,
        treeCount: 1,
        soilType: "Killi",
        irrigationType: "Damla",
        latitude: 0,
        longitude: 0,
        notes: "",
        qrCodeData: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);
    });
    expect((await db.readRaw()).parcels.some((p) => p.id === "checkpoint-sonrasi-eklenen")).toBe(true);

    // Checkpoint'e geri dön.
    const result = await backupService.restoreFromCheckpoint(checkpoint.id, "restore-user");

    expect(result.success).toBe(true);
    expect(result.safetyCheckpointId).toBeTruthy();
    const afterRestore = await db.readRaw();
    expect(afterRestore.parcels.some((p) => p.id === "checkpoint-sonrasi-eklenen")).toBe(false);
  });

  it("geçersiz (silinmiş dosyalı) bir checkpoint için restore reddedilir, hata fırlatılır, veri DEĞİŞMEZ", async () => {
    const { db, backupService } = await freshBackupModule();
    const checkpoint = await backupService.createManualCheckpoint("Silinecek Checkpoint", "test-user");
    const snapshotPath = path.join(tmpDir, "backups", "snapshots", checkpoint.snapshotFileName);
    fs.unlinkSync(snapshotPath);

    const before = await db.readRaw();

    await expect(backupService.restoreFromCheckpoint(checkpoint.id, "restore-user")).rejects.toThrow(
      "Geri yükleme reddedildi"
    );

    const after = await db.readRaw();
    expect(after.users.length).toBe(before.users.length);
    expect(after.parcels.length).toBe(before.parcels.length);
  });

  it("olmayan bir checkpoint id'si için restore reddedilir", async () => {
    const { backupService } = await freshBackupModule();
    await expect(backupService.restoreFromCheckpoint("hic-yok", "restore-user")).rejects.toThrow();
  });

  it("restore öncesi otomatik bir güvenlik checkpoint'i alınır (geri yükleme kendisi hataysa bile veri kaybı olmaz)", async () => {
    const { backupService } = await freshBackupModule();
    const checkpoint = await backupService.createManualCheckpoint("Ana Checkpoint", "test-user");

    const beforeCount = backupService.listCheckpoints().length;
    const result = await backupService.restoreFromCheckpoint(checkpoint.id, "restore-user");
    const afterCount = backupService.listCheckpoints().length;

    // Restore hem ana checkpoint'i hem de güvenlik checkpoint'ini index'e eklemiş olmalı.
    expect(afterCount).toBe(beforeCount + 1);
    expect(backupService.verifyCheckpoint(result.safetyCheckpointId).valid).toBe(true);
  });
});

// =======================================================================
// VERİ BÜTÜNLÜĞÜ — restore sonrası veri gerçekten aynı mı
// =======================================================================
describe("Veri bütünlüğü — restore sonrası tam eşleşme", () => {
  it("restore sonrası kullanıcı sayısı, parsel sayısı ve içerik checkpoint anındakiyle birebir eşleşir", async () => {
    const { db, backupService } = await freshBackupModule();

    await db.transaction((data) => {
      data.parcels.push(
        { id: "p-bütünlük-1", name: "P1", cropType: "Zeytin", areaDekar: 5, treeCount: 3, soilType: "Killi", irrigationType: "Damla", latitude: 0, longitude: 0, notes: "özel-not-123", qrCodeData: "", createdAt: "", updatedAt: "" } as any
      );
    });
    const checkpoint = await backupService.createManualCheckpoint("Bütünlük Testi", "test-user");
    const snapshotAtCheckpoint = await db.readRaw();

    // Veriyi kökten değiştir.
    await db.transaction((data) => {
      data.parcels = [];
      data.parcels.push({ id: "farkli-parsel", name: "Farklı", cropType: "Zeytin", areaDekar: 99, treeCount: 99, soilType: "X", irrigationType: "X", latitude: 0, longitude: 0, notes: "", qrCodeData: "", createdAt: "", updatedAt: "" } as any);
    });

    await backupService.restoreFromCheckpoint(checkpoint.id, "restore-user");
    const restored = await db.readRaw();

    expect(restored.parcels.length).toBe(snapshotAtCheckpoint.parcels.length);
    expect(restored.parcels.find((p) => p.id === "p-bütünlük-1")?.notes).toBe("özel-not-123");
    expect(restored.parcels.some((p) => p.id === "farkli-parsel")).toBe(false);
  });
});

// =======================================================================
// SNAPSHOT RETENTION / PRUNEOLDSNAPSHOTS — P1
// =======================================================================
describe("BackupService — snapshot retention (pruneOldSnapshots)", () => {
  it("retention limiti aşıldığında en eski snapshot dosyaları silinir, en yeniler korunur", async () => {
    vi.resetModules();
    setEnv();
    process.env.BACKUP_MAX_SNAPSHOTS = "2"; // Test için düşük bir sınır
    const { backupService } = await import("./backup.service");

    await backupService.createBackup();
    await new Promise((r) => setTimeout(r, 5));
    await backupService.createBackup();
    await new Promise((r) => setTimeout(r, 5));
    const third = await backupService.createBackup();

    const snapshotsDir = path.join(tmpDir, "backups", "snapshots");
    const remainingFiles = fs
      .readdirSync(snapshotsDir)
      .filter((f) => f.startsWith("tarim_hafizasi_") && f.endsWith(".json"));

    expect(remainingFiles.length).toBe(2);
    expect(remainingFiles).toContain(path.basename(third.snapshotPath));
  });

  it("[BULUNAN DAVRANIŞ] retention limiti, bir checkpoint'in İŞARET ETTİĞİ snapshot'ı da silebilir — checkpoint kaydı indekste kalır ama dosyası kaybolur", async () => {
    vi.resetModules();
    setEnv();
    process.env.BACKUP_MAX_SNAPSHOTS = "1"; // Kasıtlı olarak çok düşük
    const { backupService } = await import("./backup.service");

    // İlk checkpoint — bu, hemen ardından gelecek 2. createBackup çağrısı
    // tarafından fiziksel dosyası SİLİNECEK olan checkpoint.
    const firstCheckpoint = await backupService.createManualCheckpoint("İlk (silinecek)", "test-user");
    expect(backupService.verifyCheckpoint(firstCheckpoint.id).valid).toBe(true);

    await new Promise((r) => setTimeout(r, 5));
    // 2. bir backup daha alınır (createBackup içindeki pruneOldSnapshots
    // tetiklenir, maxSnapshotsToKeep=1 olduğu için en eski dosya silinir).
    await backupService.createBackup();

    // Checkpoint indekste HÂLÂ KAYITLI (listeleniyor)...
    const stillListed = backupService.listCheckpoints().some((c) => c.id === firstCheckpoint.id);
    expect(stillListed).toBe(true);

    // ...ama dosyası fiilen silindiği için artık GEÇERSİZ.
    // Kod bunu güvenle ele alıyor (çökmüyor, "false" + sebep döndürüyor),
    // ancak bu checkpoint artık KULLANILAMAZ durumda — kullanıcı arayüzünde
    // "geçerli" bir kayıt gibi görünmeye devam eder. Bkz. Sprint Sonu
    // Raporu, "Bulunan Gerçek Buglar".
    const verification = backupService.verifyCheckpoint(firstCheckpoint.id);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain("bulunamadı");
  });
});

// =======================================================================
// IMPORTCHECKPOINTFROMFILE — P1
// =======================================================================
describe("BackupService.importCheckpointFromFile", () => {
  it("geçerli bir yedek dosyası içe aktarılır, yeni bir checkpoint olarak listelenir", async () => {
    const { db, backupService } = await freshBackupModule();
    const validBackupContent = JSON.stringify(await db.readRaw());

    const checkpoint = await backupService.importCheckpointFromFile(
      Buffer.from(validBackupContent, "utf8"),
      "İçe Aktarılan Yedek",
      "test-user"
    );

    expect(checkpoint.id).toBeTruthy();
    expect(backupService.verifyCheckpoint(checkpoint.id).valid).toBe(true);
  });

  it("geçersiz JSON içeren dosya reddedilir", async () => {
    const { backupService } = await freshBackupModule();
    await expect(
      backupService.importCheckpointFromFile(Buffer.from("bu gecerli json degil", "utf8"), "Bozuk", "test-user")
    ).rejects.toThrow("geçerli bir JSON");
  });

  it("geçerli JSON ama uygulama yedek dosyası formatında olmayan (örn. 'parcels' alanı içermeyen) dosya reddedilir", async () => {
    const { backupService } = await freshBackupModule();
    await expect(
      backupService.importCheckpointFromFile(Buffer.from(JSON.stringify({ foo: "bar" }), "utf8"), "Alakasız", "test-user")
    ).rejects.toThrow("Mersin AgriTech yedek dosyası");
  });
});
