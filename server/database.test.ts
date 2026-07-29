/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 6C — DatabaseManager Veri Bütünlüğü Test Süiti.
 *
 * KAPSAM: transaction (P0), corruption recovery (P0), quarantine (P1),
 * migration (P1), atomic write (P0).
 *
 * İZOLASYON STRATEJİSİ: `DatabaseManager` singleton'ı (`export const db =
 * new DatabaseManager()`), modül import edildiği anda dosya yolunu
 * `config.ts`'ten (o da `process.env.DATABASE_PATH` / `BACKUP_DIR`'dan)
 * okuyup ANINDA örnekleniyor. Production kodunu değiştirmeden gerçek
 * dosya sistemi davranışını (bozuk JSON, eksik dosya, atomic
 * write-then-rename) test edebilmek için: her test kendi izole geçici
 * dizinini (`os.mkdtempSync`) oluşturur, `DATABASE_PATH`/`BACKUP_DIR`
 * ortam değişkenlerini bu dizine yönlendirir, `vi.resetModules()` ile
 * modül önbelleğini temizler ve `database.ts`'i dinamik `import()` ile
 * TAZE yükler — bu da `config.ts`'in yeni env değişkenleriyle yeniden
 * değerlendirilmesini ve yeni bir `DatabaseManager` örneğinin bu izole
 * dizini kullanmasını sağlar. Gerçek `data/tarim_hafizasi.json`'a hiçbir
 * testte dokunulmaz (her test kendi geçici dizininde çalışır ve sonda
 * silinir).
 *
 * Bu, MOCK değil, GERÇEK dosya I/O kullanan bir entegrasyon testidir —
 * bilinçli bir tercih: transaction atomicity, bozuk JSON kurtarma ve
 * migration gibi senaryoların gerçekliği, dosya sisteminin gerçekten
 * nasıl davrandığına bağlıdır; bir mock bu davranışı taklit ederse
 * testin kendisi anlamsızlaşır.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import type { DatabaseSchema } from "./models";

let tmpDir: string;

/**
 * Ortamı izole bir geçici dizine yönlendirip database.ts modülünü taze
 * yükler. Her testte çağrılmalıdır (DatabaseManager singleton olduğu
 * için testler arası state paylaşımını önler).
 */
async function freshDatabaseModule(): Promise<typeof import("./database")> {
  vi.resetModules();
  process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
  process.env.BACKUP_DIR = path.join(tmpDir, "backups");
  process.env.SEED_SAMPLE_DATA = "false";
  return await import("./database");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "s6c-db-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATABASE_PATH;
  delete process.env.BACKUP_DIR;
  delete process.env.SEED_SAMPLE_DATA;
});

// =======================================================================
// BOOTSTRAP — dosya yokken güvenli başlangıç (Sprint 6A'da doğrulanan
// davranışın burada kalıcı bir regresyon testi olarak sabitlenmesi)
// =======================================================================
describe("DatabaseManager — bootstrap", () => {
  it("veritabanı dosyası yokken kendiliğinden seed edilir ve diske yazılır", async () => {
    const { db } = await freshDatabaseModule();
    const data = await db.readRaw();

    expect(data.users.length).toBeGreaterThan(0);
    expect(data.users[0].username).toBe("admin");
    expect(fs.existsSync(process.env.DATABASE_PATH!)).toBe(true);
  });
});

// =======================================================================
// TRANSACTION — P0
// =======================================================================
describe("DatabaseManager.transaction", () => {
  it("başarılı bir transaction değişikliği diske kalıcı olarak yazar", async () => {
    const { db } = await freshDatabaseModule();

    await db.transaction((data) => {
      data.parcels.push({
        id: "test-parcel-1",
        name: "Test Parseli",
        cropType: "Zeytin",
        areaDekar: 10,
        treeCount: 5,
        soilType: "Killi",
        irrigationType: "Damla",
        latitude: 0,
        longitude: 0,
        notes: "",
        qrCodeData: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as DatabaseSchema["parcels"][number]);
    });

    // Diskten bağımsız olarak taze bir modül yükleyip dosyadan okuyarak
    // GERÇEKTEN diske yazıldığını (yalnızca bellekte kalmadığını) kanıtla.
    vi.resetModules();
    const { db: freshDb } = await import("./database");
    const reloaded = await freshDb.readRaw();
    expect(reloaded.parcels.some((p) => p.id === "test-parcel-1")).toBe(true);
  });

  it("transaction içinde fırlatılan exception, çağırana yeniden fırlatılır", async () => {
    const { db } = await freshDatabaseModule();

    await expect(
      db.transaction(() => {
        throw new Error("Kasıtlı test hatası");
      })
    ).rejects.toThrow("Kasıtlı test hatası");
  });

  it("[BULUNAN DAVRANIŞ] transaction içinde hata fırlarsa, o ana kadar yapılan senkron mutasyonlar bellekte kalıcı olur (rollback YOK)", async () => {
    const { db } = await freshDatabaseModule();
    const before = await db.readRaw();
    const parcelCountBefore = before.parcels.length;

    await expect(
      db.transaction((data) => {
        // Senkron olarak veriyi mutasyona uğrat, SONRA hata fırlat.
        data.parcels.push({
          id: "yarim-kalan-parcel",
          name: "Yarım Kalan",
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
        } as DatabaseSchema["parcels"][number]);
        throw new Error("Yarı yolda hata");
      })
    ).rejects.toThrow("Yarı yolda hata");

    const after = await db.readRaw();
    // BEKLENEN (ideal) davranış "rollback" olurdu (parcelCountBefore ile
    // aynı kalmalıydı). GERÇEK davranış: JS referans mutasyonu geri
    // alınmıyor, bellekteki veri kalıcı olarak bozuk kalıyor. Bu test,
    // bu gerçek davranışı BELGELEMEK için var — bkz. Sprint Sonu
        // Raporu, "Bulunan Gerçek Buglar".
    expect(after.parcels.length).toBe(parcelCountBefore + 1);
  });

  it("art arda gelen transaction'lar sırayla, veri kaybı olmadan işlenir (yazma kuyruğu)", async () => {
    const { db } = await freshDatabaseModule();

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db.transaction((data) => {
          data.settings.push({ key: `test-key-${i}`, value: String(i), updatedAt: new Date().toISOString() });
        })
      )
    );

    const data = await db.readRaw();
    for (let i = 0; i < 10; i++) {
      expect(data.settings.some((s) => s.key === `test-key-${i}`)).toBe(true);
    }
  });
});

// =======================================================================
// CORRUPTION RECOVERY + QUARANTINE — P0/P1
// =======================================================================
describe("DatabaseManager — bozuk dosya kurtarma", () => {
  it("bozuk JSON dosyası + geçerli bir yedek snapshot varsa, en son snapshot'tan otomatik kurtarılır", async () => {
    vi.resetModules();
    process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
    process.env.BACKUP_DIR = path.join(tmpDir, "backups");
    process.env.SEED_SAMPLE_DATA = "false";

    // Geçerli bir yedek snapshot'ı önceden diske yerleştir.
    const snapshotsDir = path.join(tmpDir, "backups", "snapshots");
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const validSnapshot: Partial<DatabaseSchema> = {
      users: [{ id: "kurtarilan-kullanici", username: "kurtarilan", passwordHash: "x", fullName: "Kurtarılan", role: "Admin" as any, email: "k@example.com", createdAt: "", updatedAt: "", isActive: true }],
      parcels: [], trees: [], observations: [], photos: [], inventory: [], roles: [],
    };
    fs.writeFileSync(path.join(snapshotsDir, "tarim_hafizasi_2026-01-01T00-00-00-000Z.json"), JSON.stringify(validSnapshot));

    // Ana veritabanı dosyasını KASITLI OLARAK BOZUK yaz.
    fs.writeFileSync(process.env.DATABASE_PATH!, "{ bu gecerli bir json degil !!!");

    const { db } = await import("./database");
    const data = await db.readRaw();

    expect(data.users[0].id).toBe("kurtarilan-kullanici");
  });

  it("bozuk dosya karantina klasörüne kopyalanır, orijinal ham içerik korunur", async () => {
    vi.resetModules();
    process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
    process.env.BACKUP_DIR = path.join(tmpDir, "backups");
    process.env.SEED_SAMPLE_DATA = "false";

    const corruptedContent = "{ bu gecerli bir json degil !!!";
    fs.writeFileSync(process.env.DATABASE_PATH!, corruptedContent);

    await import("./database");

    const quarantineDir = path.join(tmpDir, "corrupted");
    expect(fs.existsSync(quarantineDir)).toBe(true);
    const quarantinedFiles = fs.readdirSync(quarantineDir);
    expect(quarantinedFiles.length).toBe(1);
    const quarantinedContent = fs.readFileSync(path.join(quarantineDir, quarantinedFiles[0]), "utf8");
    expect(quarantinedContent).toBe(corruptedContent);
  });

  it("bozuk dosya + hiç geçerli yedek yoksa, boş/seed edilmiş bir veritabanıyla güvenle devam eder (çökmez)", async () => {
    vi.resetModules();
    process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
    process.env.BACKUP_DIR = path.join(tmpDir, "backups");
    process.env.SEED_SAMPLE_DATA = "false";

    fs.writeFileSync(process.env.DATABASE_PATH!, "{ bozuk json, yedek de yok");

    const { db } = await import("./database");
    const data = await db.readRaw();

    // Çökmedi, bootstrap/seed varsayılanlarıyla devam etti.
    expect(data.users.length).toBeGreaterThan(0);
    expect(data.users[0].username).toBe("admin");
  });

  it("en yeni snapshot da bozuksa, bir önceki geçerli snapshot'a düşülür", async () => {
    vi.resetModules();
    process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
    process.env.BACKUP_DIR = path.join(tmpDir, "backups");
    process.env.SEED_SAMPLE_DATA = "false";

    const snapshotsDir = path.join(tmpDir, "backups", "snapshots");
    fs.mkdirSync(snapshotsDir, { recursive: true });

    // Daha eski (alfabetik olarak önce gelen) geçerli bir snapshot.
    const olderValid: Partial<DatabaseSchema> = {
      users: [{ id: "eski-ama-gecerli", username: "eski", passwordHash: "x", fullName: "Eski", role: "Admin" as any, email: "e@example.com", createdAt: "", updatedAt: "", isActive: true }],
      parcels: [], trees: [], observations: [], photos: [], inventory: [], roles: [],
    };
    fs.writeFileSync(path.join(snapshotsDir, "tarim_hafizasi_2026-01-01T00-00-00-000Z.json"), JSON.stringify(olderValid));

    // Daha yeni (alfabetik olarak sonra gelen) ama BOZUK snapshot.
    fs.writeFileSync(path.join(snapshotsDir, "tarim_hafizasi_2026-06-01T00-00-00-000Z.json"), "{ bozuk snapshot da");

    fs.writeFileSync(process.env.DATABASE_PATH!, "{ ana dosya da bozuk");

    const { db } = await import("./database");
    const data = await db.readRaw();

    expect(data.users[0].id).toBe("eski-ama-gecerli");
  });
});

// =======================================================================
// MIGRATION — P1
// =======================================================================
describe("DatabaseManager — migration", () => {
  it("eksik bir tablo alanı içeren eski formatlı dosya, migration ile boş dizi olarak tamamlanır", async () => {
    vi.resetModules();
    process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
    process.env.BACKUP_DIR = path.join(tmpDir, "backups");
    process.env.SEED_SAMPLE_DATA = "false";

    // "equipment" tablosu hiç olmayan, eski/kısıtlı bir şema.
    const legacySchema = {
      users: [{ id: "u1", username: "eski-kullanici", passwordHash: "x", fullName: "Eski", role: "Admin", email: "e@example.com", createdAt: "", updatedAt: "", isActive: true }],
      roles: [], parcels: [], trees: [], treeCountChangeLogs: [], observations: [], photos: [],
      inventory: [], inventoryCategories: [], fertilizers: [], chemicals: [], productApplications: [],
      plantInfo: [], applications: [], irrigation: [], dosageRules: [], phenologyRules: [], weatherRules: [],
      compatibilityRules: [], safetyWarnings: [], nutritionRules: [], treatmentRecipes: [], harvest: [],
      costs: [], sales: [], weatherHistory: [], aiRecommendations: [], uploadedDocuments: [], vectorChunks: [],
      notifications: [], activityLogs: [], settings: [],
      // "equipment" BİLİNÇLİ OLARAK EKSİK
    };
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(legacySchema));

    const { db } = await import("./database");
    const data = await db.readRaw();

    expect(Array.isArray(data.equipment)).toBe(true);
    expect(data.equipment.length).toBe(0);
    expect(data.users[0].id).toBe("u1"); // Mevcut gerçek veri korunmuş
  });

  it("activityType alanı olmayan eski gözlem kayıtlarına migration ile varsayılan değer atanır (veri kaybı yok)", async () => {
    vi.resetModules();
    process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
    process.env.BACKUP_DIR = path.join(tmpDir, "backups");
    process.env.SEED_SAMPLE_DATA = "false";

    const legacySchema: any = {
      users: [], roles: [], parcels: [], trees: [], treeCountChangeLogs: [],
      observations: [{ id: "obs-eski", parcelId: "p1", note: "Eski kayıt", date: "2025-01-01", photoIds: [] }],
      photos: [], inventory: [], equipment: [], inventoryCategories: [], fertilizers: [], chemicals: [],
      productApplications: [], plantInfo: [], applications: [], irrigation: [], dosageRules: [], phenologyRules: [],
      weatherRules: [], compatibilityRules: [], safetyWarnings: [], nutritionRules: [], treatmentRecipes: [],
      harvest: [], costs: [], sales: [], weatherHistory: [], aiRecommendations: [], uploadedDocuments: [],
      vectorChunks: [], notifications: [], activityLogs: [], settings: [],
    };
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(legacySchema));

    const { db } = await import("./database");
    const data = await db.readRaw();

    expect(data.observations.length).toBe(1); // Kayıt SİLİNMEDİ
    expect(data.observations[0].activityType).toBe("Genel Gözlem");
    expect(data.observations[0].id).toBe("obs-eski"); // Kimlik korunmuş
  });

  it("migration boş inventoryCategories'i varsayılan kategorilerle doldurur", async () => {
    vi.resetModules();
    process.env.DATABASE_PATH = path.join(tmpDir, "tarim_hafizasi.json");
    process.env.BACKUP_DIR = path.join(tmpDir, "backups");
    process.env.SEED_SAMPLE_DATA = "false";

    const legacySchema: any = {
      users: [], roles: [], parcels: [], trees: [], treeCountChangeLogs: [], observations: [], photos: [],
      inventory: [], equipment: [], inventoryCategories: [], fertilizers: [], chemicals: [], productApplications: [],
      plantInfo: [], applications: [], irrigation: [], dosageRules: [], phenologyRules: [], weatherRules: [],
      compatibilityRules: [], safetyWarnings: [], nutritionRules: [], treatmentRecipes: [], harvest: [],
      costs: [], sales: [], weatherHistory: [], aiRecommendations: [], uploadedDocuments: [], vectorChunks: [],
      notifications: [], activityLogs: [], settings: [],
    };
    fs.writeFileSync(process.env.DATABASE_PATH!, JSON.stringify(legacySchema));

    const { db } = await import("./database");
    const data = await db.readRaw();

    expect(data.inventoryCategories.length).toBeGreaterThan(0);
  });
});
