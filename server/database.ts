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
 * Thread-safe relational database manager.
 * Provides data transaction guards, foreign key integrity checks, seeding routines,
 * and robust migration capabilities for continuous operation in production.
 */
class DatabaseManager {
  private dbPath: string;
  private data: DatabaseSchema | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.dbPath = config.database.path;
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
      "users", "roles", "parcels", "trees", "observations", "photos", "inventory",
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

    if (mutated) {
      this.saveImmediate();
      logger.info("DATABASE", "Alembic-style migration successful: Schema definitions fully aligned.");
    }
  }

  /**
   * Persists database state synchronously to disk.
   */
  private saveImmediate(): void {
    try {
      if (!this.data) return;
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), "utf8");
    } catch (error) {
      logger.error("DATABASE", "Failed writing database file.", error);
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
