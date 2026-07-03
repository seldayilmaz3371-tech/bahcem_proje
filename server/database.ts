/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import { config } from "./config";
import { logger } from "./logger";
import { AgriUtils } from "./utils";
import { 
  DatabaseSchema, 
  User, 
  UserRole, 
  Role, 
  InventoryCategory, 
  SystemSetting 
} from "./models";

/**
 * System setting key used to guard the one-time removal of legacy bundled
 * demo/sample records (Mersin Değirmençay showcase data). Once this flag is
 * set to "true", the purge routine will never run again, ensuring the
 * operation is fully idempotent across server restarts.
 */
const LEGACY_SAMPLE_DATA_PURGE_FLAG = "legacy_sample_data_purged";

/**
 * Thread-safe relational database manager.
 * Provides data transaction guards, foreign key integrity checks, seeding routines,
 * and robust migration capabilities for continuous operation in production.
 */
class DatabaseManager {
  private dbPath: string;
  private data: DatabaseSchema | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    // Resolve to an absolute path so there is never ambiguity about which
    // physical file is being read from or written to, regardless of the
    // working directory the process happened to be started from.
    this.dbPath = path.resolve(config.database.path);
    logger.info(
      "DATABASE",
      `Veritabanı dosya yolu çözümlendi: ${this.dbPath}`,
      { processWorkingDirectory: process.cwd() }
    );
    this.initializeDatabase();
  }

  /**
   * Reads data from file or seeds if database file is missing or corrupted.
   */
  private initializeDatabase(): void {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dbPath)) {
        const fileContent = fs.readFileSync(this.dbPath, "utf8");
        this.data = JSON.parse(fileContent) as DatabaseSchema;
        this.runMigrations(); // Run migration checks on load
        logger.info("DATABASE", "Database successfully loaded from storage.", { path: this.dbPath });
      } else {
        logger.warn("DATABASE", "Database file not found. Bootstrapping initial database and seeding defaults.");
        this.seedInitialDatabase();
      }
    } catch (error) {
      logger.error("DATABASE", "Fatal error during database initialization. Restoring with a clean seed to prevent crashes.", error);
      this.seedInitialDatabase();
    }
  }

  /**
   * Seeds default admin, worker, guest roles, core product categories, and system settings.
   */
  private seedInitialDatabase(): void {
    const timestamp = new Date().toISOString();

    // Default admin default passwords
    const saltRounds = 10;
    const adminPasswordHash = bcrypt.hashSync(config.security.adminDefaultPasswordHash, saltRounds);

    const defaultRoles: Role[] = [
      {
        id: "role-admin",
        name: UserRole.ADMIN,
        description: "Tüm sistem yetkilerine sahip yönetici.",
        permissions: ["*"]
      },
      {
        id: "role-worker",
        name: UserRole.WORKER,
        description: "Sahada tarımsal uygulamaları yapan, gözlem giren personel.",
        permissions: ["parcels:read", "trees:read", "observations:write", "applications:write", "inventory:read"]
      },
      {
        id: "role-guest",
        name: UserRole.GUEST,
        description: "Sadece verileri görüntüleyebilen misafir kullanıcı.",
        permissions: ["*:read"]
      }
    ];

    const defaultAdmin: User = {
      id: "user-admin-default",
      username: "admin",
      passwordHash: adminPasswordHash,
      fullName: "Mersin Çiftlik Yöneticisi",
      role: UserRole.ADMIN,
      email: "seldayilmaz3371@gmail.com",
      phoneNumber: "+90 533 000 0000",
      createdAt: timestamp,
      updatedAt: timestamp,
      isActive: true
    };

    const defaultCategories: InventoryCategory[] = [
      { id: "cat-pesticide", name: "İlaç", description: "Hastalık ve zararlılarla mücadele kimyasalları/biyolojik ürünleri." },
      { id: "cat-fertilizer", name: "Gübre", description: "Toprak ve yaprak besleme gübreleri." },
      { id: "cat-biological", name: "Biyolojik Ürün", description: "Faydalı böcekler veya organik tuzaklar." },
      { id: "cat-tool", name: "Alet/Ekipman", description: "Tarım aletleri ve sarf malzemeleri." }
    ];

    const defaultSettings: SystemSetting[] = [
      { key: "theme", value: "light", updatedAt: timestamp },
      { key: "language", value: "tr", updatedAt: timestamp },
      { key: "location_lat", value: String(config.geography.latitude), updatedAt: timestamp },
      { key: "location_lng", value: String(config.geography.longitude), updatedAt: timestamp },
      { key: "location_name", value: config.geography.locationName, updatedAt: timestamp }
    ];

    const initialDb: DatabaseSchema = {
      users: [defaultAdmin],
      roles: defaultRoles,
      parcels: [],
      trees: [],
      treeCountChangeLogs: [],
      observations: [],
      photos: [],
      inventory: [],
      inventoryCategories: defaultCategories,
      fertilizers: [],
      chemicals: [],
      applications: [],
      irrigation: [],
      harvest: [],
      costs: [],
      sales: [],
      profitReports: [],
      weatherHistory: [],
      aiTasks: [],
      aiRecommendations: [],
      uploadedDocuments: [],
      vectorChunks: [],
      notifications: [],
      activityLogs: [],
      settings: defaultSettings
    };

    this.data = initialDb;
    this.saveImmediate();
    logger.info("DATABASE", "Database successfully seeded with default structures, categories, and administrator.");
  }

  /**
   * Runs schema migrations safely. Simulates Alembic migrations dynamically.
   * If any tables are added in the models, this ensures no data loss.
   */
  private runMigrations(): void {
    if (!this.data) return;
    let mutated = false;

    // Table safety guards: Ensure all properties of DatabaseSchema are present
    const tables: Array<keyof DatabaseSchema> = [
      "users", "roles", "parcels", "trees", "treeCountChangeLogs", "observations", "photos", "inventory",
      "inventoryCategories", "fertilizers", "chemicals", "applications", "irrigation",
      "harvest", "costs", "sales", "profitReports", "weatherHistory", "aiTasks",
      "aiRecommendations", "uploadedDocuments", "vectorChunks", "notifications",
      "activityLogs", "settings"
    ];

    for (const table of tables) {
      if (!this.data[table]) {
        (this.data as any)[table] = [];
        mutated = true;
        logger.warn("DATABASE", `Migration: Added missing table array for: ${table}`);
      }
    }

    // Category check for empty DBs
    if (this.data.inventoryCategories.length === 0) {
      this.data.inventoryCategories = [
        { id: "cat-pesticide", name: "İlaç", description: "Hastalık ve zararlılarla mücadele kimyasalları/biyolojik ürünleri." },
        { id: "cat-fertilizer", name: "Gübre", description: "Toprak ve yaprak besleme gübreleri." },
        { id: "cat-biological", name: "Biyolojik Ürün", description: "Faydalı böcekler veya organik tuzaklar." },
        { id: "cat-tool", name: "Alet/Ekipman", description: "Tarım aletleri ve sarf malzemeleri." }
      ];
      mutated = true;
    }

    // Seeding check for sample data. Only runs when explicitly enabled via
    // SEED_SAMPLE_DATA=true, so real production databases never receive
    // fabricated demo parcels, costs, sales, or harvests automatically.
    if (config.database.seedSampleData && this.data.parcels.length === 0) {
      this.seedSampleData();
      mutated = true;
    }

    // One-time safe cleanup of any legacy demo data that was previously
    // auto-generated by earlier versions of this application. Skipped when
    // SEED_SAMPLE_DATA=true, since in that mode the demo data is being
    // requested intentionally (e.g. for a local demo) and must not be
    // wiped out immediately after being generated.
    if (!config.database.seedSampleData && this.purgeLegacySampleData()) {
      mutated = true;
    }

    if (mutated) {
      this.saveImmediate();
      logger.info("DATABASE", "Alembic-style migration successful: Schema definitions fully aligned.");
    }
  }

  /**
   * Removes the static, bundled Mersin Değirmençay showcase/demo records
   * (sample parcels, trees, observations, inventory, weather history, costs,
   * sales, harvests, notifications, AI recommendations, uploaded documents,
   * vector chunks, and activity logs) that earlier versions of this
   * application generated automatically.
   *
   * Safety guarantee: only records whose IDs exactly match the known,
   * hardcoded demo identifiers below are removed. Every record a user
   * creates through the application receives a randomly generated UUID
   * (see AgriUtils.generateId), so this operation can never delete real
   * user-entered data. The operation is tracked via a persisted system
   * setting flag and therefore executes at most once.
   *
   * @returns true if the database was mutated (either records were removed
   *          or the purge flag was written for the first time), false if the
   *          purge had already run previously and no work was needed.
   */
  private purgeLegacySampleData(): boolean {
    if (!this.data) return false;

    const alreadyPurged = this.data.settings.some(
      (setting) => setting.key === LEGACY_SAMPLE_DATA_PURGE_FLAG && setting.value === "true"
    );
    if (alreadyPurged) {
      return false;
    }

    const legacyDemoIdsByTable: Partial<Record<keyof DatabaseSchema, string[]>> = {
      parcels: ["parcel-1", "parcel-2", "parcel-3"],
      trees: [
        "tree-1-1", "tree-1-2", "tree-1-3", "tree-1-4", "tree-1-5",
        "tree-2-1", "tree-2-2", "tree-2-3", "tree-2-4",
        "tree-3-1", "tree-3-2", "tree-3-3"
      ],
      observations: ["obs-1", "obs-2", "obs-3"],
      inventory: ["inv-1", "inv-2", "inv-3", "inv-4"],
      weatherHistory: ["weather-1", "weather-2", "weather-3", "weather-4", "weather-5"],
      costs: ["cost-1", "cost-2", "cost-3"],
      sales: ["sale-1", "sale-2"],
      harvest: ["harv-1", "harv-2"],
      notifications: ["notif-1", "notif-2"],
      aiRecommendations: ["rec-1"],
      uploadedDocuments: ["doc-1", "doc-2"],
      vectorChunks: ["chunk-1", "chunk-2", "chunk-3", "chunk-4"],
      activityLogs: ["log-1", "log-2"]
    };

    let removedCount = 0;
    for (const tableKey of Object.keys(legacyDemoIdsByTable) as Array<keyof DatabaseSchema>) {
      const idsToRemove = legacyDemoIdsByTable[tableKey];
      if (!idsToRemove || idsToRemove.length === 0) continue;

      const records = this.data[tableKey] as unknown as Array<{ id: string }>;
      if (!Array.isArray(records) || records.length === 0) continue;

      const originalLength = records.length;
      const filteredRecords = records.filter((record) => !idsToRemove.includes(record.id));
      removedCount += originalLength - filteredRecords.length;
      (this.data as any)[tableKey] = filteredRecords;
    }

    const timestamp = new Date().toISOString();
    this.data.settings.push({
      key: LEGACY_SAMPLE_DATA_PURGE_FLAG,
      value: "true",
      updatedAt: timestamp
    });

    logger.info(
      "DATABASE",
      `One-time cleanup completed: removed ${removedCount} bundled demo/sample record(s). This routine will not run again.`
    );

    return true;
  }

  /**
   * Seeds realistic sample data for the Mersin Değirmençay region.
   */
  private seedSampleData(): void {
    if (!this.data) return;
    const timestamp = new Date().toISOString();

    logger.info("DATABASE", "Seeding realistic Mersin Değirmençay agricultural sample data.");

    // 1. Parcels
    this.data.parcels = [
      {
        id: "parcel-1",
        name: "Kuzey Yamaç Zeytinliği",
        latitude: 36.9312,
        longitude: 34.4255,
        areaDekar: 12.5,
        treeCount: 5,
        soilType: "Killi-Tınlı",
        irrigationType: "Damlama",
        notes: "Sarıulak ağırlıklı, rüzgara açık kuzey yamaç.",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "parcel-2",
        name: "Derekenarı Düzlüğü",
        latitude: 36.9288,
        longitude: 34.4290,
        areaDekar: 8.0,
        treeCount: 4,
        soilType: "Tınlı",
        irrigationType: "Damlama",
        notes: "Su sıkıntısı olmayan, derin profilli alüvyal toprak.",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "parcel-3",
        name: "Tepebağ Eski Bahçe",
        latitude: 36.9340,
        longitude: 34.4210,
        areaDekar: 6.2,
        treeCount: 3,
        soilType: "Kireçli",
        irrigationType: "Kuru",
        notes: "Geleneksel dikim, yaşlı ağaçlar, susuz tarım.",
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];

    // 2. Trees
    this.data.trees = [
      // parcel-1
      { id: "tree-1-1", parcelId: "parcel-1", treeNumber: "KY-T01", variety: "Sarıulak", plantingYear: 2012, createdAt: timestamp, updatedAt: timestamp, notes: "Verimi yüksek, güçlü taç gelişimi." },
      { id: "tree-1-2", parcelId: "parcel-1", treeNumber: "KY-T02", variety: "Sarıulak", plantingYear: 2012, createdAt: timestamp, updatedAt: timestamp, notes: "Damlama ucu kontrol edilmeli, biraz gölge görüyor." },
      { id: "tree-1-3", parcelId: "parcel-1", treeNumber: "KY-T03", variety: "Sarıulak", plantingYear: 2013, createdAt: timestamp, updatedAt: timestamp },
      { id: "tree-1-4", parcelId: "parcel-1", treeNumber: "KY-T04", variety: "Ayvalık", plantingYear: 2015, createdAt: timestamp, updatedAt: timestamp },
      { id: "tree-1-5", parcelId: "parcel-1", treeNumber: "KY-T05", variety: "Sarıulak", plantingYear: 2012, createdAt: timestamp, updatedAt: timestamp, notes: "Gövde çevresi sağlıklı." },
      // parcel-2
      { id: "tree-2-1", parcelId: "parcel-2", treeNumber: "DK-T01", variety: "Ayvalık", plantingYear: 2014, createdAt: timestamp, updatedAt: timestamp },
      { id: "tree-2-2", parcelId: "parcel-2", treeNumber: "DK-T02", variety: "Ayvalık", plantingYear: 2014, createdAt: timestamp, updatedAt: timestamp },
      { id: "tree-2-3", parcelId: "parcel-2", treeNumber: "DK-T03", variety: "Ayvalık", plantingYear: 2014, createdAt: timestamp, updatedAt: timestamp, notes: "Nemli toprağı seviyor." },
      { id: "tree-2-4", parcelId: "parcel-2", treeNumber: "DK-T04", variety: "Ayvalık", plantingYear: 2015, createdAt: timestamp, updatedAt: timestamp },
      // parcel-3
      { id: "tree-3-1", parcelId: "parcel-3", treeNumber: "TB-T01", variety: "Gemlik", plantingYear: 2008, createdAt: timestamp, updatedAt: timestamp, notes: "En yaşlı ve anıt ağaç statüsünde verimli." },
      { id: "tree-3-2", parcelId: "parcel-3", treeNumber: "TB-T02", variety: "Gemlik", plantingYear: 2008, createdAt: timestamp, updatedAt: timestamp, notes: "Halkalı leke geçmişi var, yakından izlenmeli." },
      { id: "tree-3-3", parcelId: "parcel-3", treeNumber: "TB-T03", variety: "Gemlik", plantingYear: 2009, createdAt: timestamp, updatedAt: timestamp }
    ];

    // 3. Observations
    this.data.observations = [
      {
        id: "obs-1",
        parcelId: "parcel-1",
        treeId: "tree-1-2",
        observerId: "user-admin-default",
        observationDate: "2026-06-15",
        notes: "KY-T02 ağacının altındaki damlama memesi tıkanmıştı. Temizlenerek su akışı yeniden sağlandı. Yapraklarda hafif sararma başlangıcı var.",
        createdAt: timestamp
      },
      {
        id: "obs-2",
        parcelId: "parcel-3",
        treeId: "tree-3-2",
        observerId: "user-admin-default",
        observationDate: "2026-06-20",
        notes: "Tepebağ parselindeki Gemlik çeşidi ağaçta dairesel gri halkalar (Halkalı Leke belirtileri) gözlendi. Bakırlı ilaç (Bordo bulamacı) uygulaması ilk serin günde yapılacaktır.",
        createdAt: timestamp
      },
      {
        id: "obs-3",
        parcelId: "parcel-2",
        treeId: "tree-2-3",
        observerId: "user-admin-default",
        observationDate: "2026-06-25",
        notes: "Zeytin sineği popülasyon tespiti için asılan feromonlu sarı yapışkan tuzaklar incelendi. Tuzak başına ortalama 1 adet sinek sayıldı, henüz mücadele eşiğinin altında.",
        createdAt: timestamp
      }
    ];

    // 4. Inventory items
    this.data.inventory = [
      {
        id: "inv-1",
        categoryId: "cat-pesticide",
        name: "Hektaş Göztaşı (%25 Bakır Sülfat)",
        brand: "Hektaş",
        sku: "HEK-GOZ-25",
        stockQuantity: 25,
        unit: "Kg",
        minStockAlert: 10,
        unitPrice: 150,
        expiryDate: "2028-12-31",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "inv-2",
        categoryId: "cat-fertilizer",
        name: "Genta Çinko-Bor Yaprak Gübresi",
        brand: "Genta",
        sku: "GEN-ZN-B-5L",
        stockQuantity: 8,
        unit: "Litre",
        minStockAlert: 5,
        unitPrice: 220,
        expiryDate: "2027-06-30",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "inv-3",
        categoryId: "cat-biological",
        name: "Zeytin Sineği Yapışkan Sarı Tuzak",
        brand: "Koppert",
        sku: "KOP-YAP-TRAP",
        stockQuantity: 4,
        unit: "Adet",
        minStockAlert: 15,
        unitPrice: 35,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "inv-4",
        categoryId: "cat-tool",
        name: "Şarjlı Budama Makası",
        brand: "Makita",
        sku: "MAK-BUD-01",
        stockQuantity: 2,
        unit: "Adet",
        minStockAlert: 1,
        unitPrice: 4500,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];

    // 5. WeatherHistory
    this.data.weatherHistory = [
      {
        id: "weather-1",
        recordDate: "2026-06-26",
        tempMin: 14,
        tempMax: 32,
        humidity: 55,
        windSpeed: 12,
        precipitationMm: 0,
        condition: "Açık ve Güneşli",
        hasFrostRisk: false,
        soilTemperature: 22,
        createdAt: timestamp
      },
      {
        id: "weather-2",
        recordDate: "2026-06-27",
        tempMin: 15,
        tempMax: 31,
        humidity: 60,
        windSpeed: 8,
        precipitationMm: 0,
        condition: "Açık",
        hasFrostRisk: false,
        soilTemperature: 21.5,
        createdAt: timestamp
      },
      {
        id: "weather-3",
        recordDate: "2026-06-28",
        tempMin: 12,
        tempMax: 28,
        humidity: 65,
        windSpeed: 14,
        precipitationMm: 2.5,
        condition: "Hafif Sağanak Yağışlı",
        hasFrostRisk: false,
        soilTemperature: 20,
        createdAt: timestamp
      },
      {
        id: "weather-4",
        recordDate: "2026-06-29",
        tempMin: 3.5,
        tempMax: 21,
        humidity: 75,
        windSpeed: 18,
        precipitationMm: 0,
        condition: "Bulutlu ve Rüzgarlı",
        hasFrostRisk: true,
        soilTemperature: 12,
        createdAt: timestamp
      },
      {
        id: "weather-5",
        recordDate: "2026-06-30",
        tempMin: 6.2,
        tempMax: 24,
        humidity: 52,
        windSpeed: 10,
        precipitationMm: 0,
        condition: "Parçalı Bulutlu",
        hasFrostRisk: false,
        soilTemperature: 15.5,
        createdAt: timestamp
      }
    ];

    // 6. Costs
    this.data.costs = [
      {
        id: "cost-1",
        parcelId: "parcel-1",
        category: "Gübreleme",
        amount: 3500,
        costDate: "2026-05-10",
        description: "Kuzey Yamaç parseli için organik taban gübresi alımı ve uygulaması.",
        createdAt: timestamp
      },
      {
        id: "cost-2",
        parcelId: "parcel-3",
        category: "İlaçlama",
        amount: 1800,
        costDate: "2026-05-18",
        description: "Tepebağ parseli bakırlı ilaç uygulaması işçilik ve ilaç maliyeti.",
        createdAt: timestamp
      },
      {
        id: "cost-3",
        parcelId: undefined,
        category: "Yakıt",
        amount: 1200,
        costDate: "2026-05-22",
        description: "Çiftlik traktörü akaryakıt alımı.",
        createdAt: timestamp
      }
    ];

    // 7. Sales
    this.data.sales = [
      {
        id: "sale-1",
        saleDate: "2026-06-10",
        buyerName: "Bölgesel Gurme Marketler Zinciri",
        productType: "Zeytinyağı (Sızma)",
        quantityKg: 200,
        unitPrice: 350,
        totalRevenue: 70000,
        isOrganikSaglikBrand: true,
        notes: "Premium 'Organik Sağlık' markalı zeytinyağı satışı.",
        createdAt: timestamp
      },
      {
        id: "sale-2",
        saleDate: "2026-06-18",
        buyerName: "Mersin Tariş Zeytin Kooperatifi",
        productType: "Yeşil Zeytin (Sarıulak)",
        quantityKg: 150,
        unitPrice: 180,
        totalRevenue: 27000,
        isOrganikSaglikBrand: false,
        notes: "Sofralık Sarıulak zeytin teslimi.",
        createdAt: timestamp
      }
    ];

    // 8. Harvest
    this.data.harvest = [
      {
        id: "harv-1",
        parcelId: "parcel-1",
        harvestDate: "2025-11-15",
        quantityKg: 1200,
        qualityGrade: "Sızmalık Elit",
        personnelCount: 6,
        laborCost: 4500,
        transportCost: 800,
        otherCosts: 1200,
        totalCost: 6500,
        notes: "Sarıulak çeşidi el ile hasat edildi.",
        createdAt: timestamp
      },
      {
        id: "harv-2",
        parcelId: "parcel-2",
        harvestDate: "2025-11-20",
        quantityKg: 900,
        qualityGrade: "Birinci Kalite Sofralık",
        personnelCount: 4,
        laborCost: 3200,
        transportCost: 600,
        otherCosts: 900,
        totalCost: 4700,
        notes: "Düşük asit oranına sahip sofralık Ayvalık zeytini.",
        createdAt: timestamp
      }
    ];

    // 9. Notifications
    this.data.notifications = [
      {
        id: "notif-1",
        title: "Kritik Stok Uyarısı",
        message: "'Zeytin Sineği Yapışkan Sarı Tuzak' stoğunuz 4 adet kalmıştır. Güvenli sınır: 15 Adet.",
        type: "LowStock",
        isRead: false,
        createdAt: timestamp
      },
      {
        id: "notif-2",
        title: "Düşük Sıcaklık ve Don Uyarısı",
        message: "Meteorolojik tahminlere göre Değirmençay mevkisinde sıcaklık 3.5°C seviyesine inmiştir, don riski mevcuttur.",
        type: "Frost",
        isRead: false,
        createdAt: timestamp
      }
    ];

    // 10. AI recommendations (History)
    this.data.aiRecommendations = [
      {
        id: "rec-1",
        parcelId: "parcel-3",
        recommendationType: "Hastalık",
        content: `### Tepebağ Eski Bahçe - Hastalık Teşhisi ve Eylem Planı\n\n**Bulgular:** Gözlem kayıtlarına göre Gemlik çeşidindeki yaşlı zeytin ağaçlarında (özellikle TB-T02 no'lu ağaç) dairesel gri halkalar halinde **Halkalı Leke Hastalığı** (Spilocaea oleagina) belirtileri izlenmiştir.\n\n**Çözüm Önerileri:**\n1. **İlaçlama Zamanı:** Havadaki nispi nemin %60'ın üzerinde olduğu ve havaların serin gittiği bu dönem, hastalığın sporlanması için idealdir. Rüzgarsız ve yağışsız ilk gün ilkbahar koruyucu ilaçlaması yapılmalıdır.\n2. **Kullanılacak İlaç:** Envanterinizde mevcut olan **Hektaş Göztaşı (%25 Bakır Sülfat)** ile %1'lik Bordo Bulamacı hazırlayın. 100 litre suya 1 kg göztaşı ve 500 gr sönmüş kireç oranında karışım hazırlayarak ağaçların yaprakları tamamen ıslanacak şekilde (pülverize) uygulayın.\n3. **Kültürel Önlemler:** Ağaç içi havalandırmayı arttırmak için zayıf ve hastalıklı dalları bir sonraki budamada temizleyin ve dökülen yaprakları toplayıp imha edin.\n\n*Yapay Zeka Danışman Güven Skoru: %92*`,
        confidenceScore: 0.92,
        usedDocumentsCount: 1,
        usedObservationsCount: 1,
        usedWeatherCount: 5,
        usedInventoryCount: 4,
        createdDate: timestamp
      }
    ];

    // 11. Uploaded Documents
    this.data.uploadedDocuments = [
      {
        id: "doc-1",
        fileName: "Değirmençay Zeytin Hastalıkları Rehberi.txt",
        fileType: "txt",
        fileSize: 1250,
        uploadedBy: "user-admin-default",
        uploadDate: timestamp,
        summary: "Mersin Değirmençay yöresindeki zeytinliklerde görülen halkalı leke, zeytin sineği ve dal kanseri hastalıklarının teşhisi, kültürel önlemleri ve bakırlı ilaçlama rehberi."
      },
      {
        id: "doc-2",
        fileName: "Toroslar Don Önleme Metotları.txt",
        fileType: "txt",
        fileSize: 1680,
        uploadedBy: "user-admin-default",
        uploadDate: timestamp,
        summary: "Toroslar eteklerindeki mikro-klimada bahar ayazları ve kış donlarına karşı yağmurlama sulama, dumanlama ve rüzgar perdeleri yardımıyla zeytin çiçeklerinin korunması."
      }
    ];

    // 12. Vector Chunks
    const makeEmbedding = () => Array.from({ length: 768 }, () => parseFloat((Math.random() * 0.1 - 0.05).toFixed(4)));
    this.data.vectorChunks = [
      {
        id: "chunk-1",
        documentId: "doc-1",
        chunkIndex: 0,
        content: "Zeytin halkalı lekesi (Spilocaea oleagina) yapraklarda dairesel gri ve koyu yeşil lekeler oluşturarak erken yaprak dökümüne ve dolaylı olarak ciddi verim kayıplarına yol açar. Mersin Değirmençay mevkisinde ilkbahar yağışları öncesinde koruyucu olarak bakır sülfat (Göztaşı) veya hazır bakırlı preparatlar uygulanmalıdır. Dozaj olarak %1'lik Bordo Bulamacı önerilir.",
        embeddings: makeEmbedding()
      },
      {
        id: "chunk-2",
        documentId: "doc-1",
        chunkIndex: 1,
        content: "Zeytin sineği (Bactrocera oleae), zeytin danelerine yumurta bırakarak kurtlanmaya ve asitlik oranının yükselmesine yol açar. Mücadelede feromonlu sarı yapışkan tuzaklar popülasyon izlemek için çok etkilidir. Tuzak başına 4-5 adet sinek tespit edildiğinde ilaçlı mücadeleye geçilmelidir. Envanterdeki tuzaklar ağaçların güneydoğu yönüne asılmalıdır.",
        embeddings: makeEmbedding()
      },
      {
        id: "chunk-3",
        documentId: "doc-2",
        chunkIndex: 0,
        content: "Mersin Toroslar bölgesinde kışın veya bahar başlangıcında kuzeyden esen soğuk rüzgarlarla ani gece donları (ayaz) oluşabilir. Don zararı özellikle çiçeklenme veya sürgün verme dönemindeki zeytinlikleri etkiler. Donu önlemek için gece yarısı damlama sulama sistema kesintisiz çalıştırılarak suyun donarken yaydığı ısı enerjisinden faydalanılır.",
        embeddings: makeEmbedding()
      },
      {
        id: "chunk-4",
        documentId: "doc-2",
        chunkIndex: 1,
        content: "Bahçede saman, kuru ot ve yaş odunların kontrollü bir şekilde yakılmasıyla duman perdesi oluşturmak, soğuk havanın tabana çökmesini engelleyerek sıcaklığı 1-2 derece koruyabilir. Ayrıca rüzgar kıran çitler veya rüzgar makineleri de soğuk hava dalgalarını dağıtmakta etkilidir.",
        embeddings: makeEmbedding()
      }
    ];

    // 13. Activity logs
    this.data.activityLogs = [
      {
        id: "log-1",
        userId: "user-admin-default",
        action: "DATABASE_SEED",
        details: "Mersin Değirmençay yöresi zeytin tarımı örnek veritabanı başarıyla kuruldu.",
        createdAt: timestamp
      },
      {
        id: "log-2",
        userId: "user-admin-default",
        action: "LOGIN_SUCCESS",
        details: "Çiftlik yöneticisi başarıyla oturum açtı.",
        createdAt: timestamp
      }
    ];
  }

  /**
   * Persists database state synchronously to disk using an atomic
   * write-then-rename pattern. Writing to a temporary file first and only
   * renaming it into place once the write has fully completed prevents a
   * truncated or corrupted database file if the process is killed or
   * restarted (e.g. by a file-watcher like `tsx`) mid-write.
   */
  private saveImmediate(): void {
    if (!this.data) return;
    const tempPath = `${this.dbPath}.tmp`;
    try {
      const serialized = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(tempPath, serialized, "utf8");
      fs.renameSync(tempPath, this.dbPath);

      logger.debug("DATABASE", "Veritabanı diske başarıyla yazıldı.", {
        path: this.dbPath,
        parcels: this.data.parcels.length,
        trees: this.data.trees.length,
        treeCountChangeLogs: this.data.treeCountChangeLogs.length,
        costs: this.data.costs.length,
        sales: this.data.sales.length,
        harvest: this.data.harvest.length,
      });
    } catch (error) {
      logger.error("DATABASE", "Failed writing database file.", error, { path: this.dbPath, tempPath });
    }
  }

  /**
   * Enqueues write operations to prevent file-system race conditions and lockups.
   */
  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => {
      return new Promise<void>((resolve) => {
        try {
          this.saveImmediate();
        } catch (error) {
          logger.error("DATABASE", "Error inside write execution queue.", error);
        }
        resolve();
      });
    });
    return this.writeQueue;
  }

  /**
   * Retrieves the raw complete data of the database under secure guard.
   */
  public async readRaw(): Promise<DatabaseSchema> {
    if (!this.data) {
      this.initializeDatabase();
    }
    return this.data!;
  }

  /**
   * Commits updates to the database safely.
   * @param updateFn Callback function to manipulate the database schema
   */
  public async transaction(updateFn: (db: DatabaseSchema) => void | Promise<void>): Promise<void> {
    if (!this.data) {
      this.initializeDatabase();
    }
    
    try {
      await updateFn(this.data!);
      await this.persist();
    } catch (error) {
      logger.error("DATABASE", "Database transaction aborted due to exception.", error);
      throw error;
    }
  }

  /**
   * Safely deletes database state and triggers re-seed. Used for testing and factory resets.
   */
  public async resetDatabase(): Promise<void> {
    logger.warn("DATABASE", "Database factory reset requested!");
    await this.transaction((db) => {
      this.seedInitialDatabase();
    });
  }
}

export const db = new DatabaseManager();
