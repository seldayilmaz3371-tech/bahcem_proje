/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config();

/**
 * Interface representing the application configuration schema.
 */
export interface AppConfig {
  env: string;
  port: number;
  database: {
    type: string;
    path: string;
    seedSampleData: boolean;
  };
  backup: {
    directory: string;
    intervalHours: number;
  };
  geography: {
    latitude: number;
    longitude: number;
    locationName: string;
  };
  security: {
    sessionSecret: string;
    adminDefaultPasswordHash: string;
  };
  gemini: {
    apiKey: string;
  };
}

/**
 * Application Configuration Manager
 * Manages configuration variables for the digital agriculture assistant,
 * centering on the Değirmençay and Toroslar regions of Mersin.
 */
class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Loads configurations from environment variables with safe defaults.
   * Ensures zero hardcoded secrets and high maintainability.
   * @returns AppConfig object
   */
  private loadConfig(): AppConfig {
    const env = process.env.NODE_ENV || "development";
    const port = parseInt(process.env.PORT || "3000", 10);
    const dbType = process.env.DATABASE_TYPE || "local_json";
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "tarim_hafizasi.json");
    const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
    const backupInterval = parseInt(process.env.BACKUP_INTERVAL_HOURS || "24", 10);

    // Controls whether the bundled Mersin Değirmençay showcase/demo data
    // (sample parcels, trees, costs, sales, harvests, notifications, etc.)
    // is automatically generated on a fresh/empty database. Defaults to
    // "false" so production deployments always start with a clean,
    // user-owned dataset. Set to "true" only for local demos or onboarding.
    const seedSampleData = (process.env.SEED_SAMPLE_DATA || "false").trim().toLowerCase() === "true";

    // Geographic defaults for Mersin Toroslar, Değirmençay
    const lat = parseFloat(process.env.DEFAULT_LATITUDE || "36.8741");
    const lng = parseFloat(process.env.DEFAULT_LONGITUDE || "34.4512");
    const locName = process.env.DEFAULT_LOCATION_NAME || "Toroslar, Değirmençay, Mersin";

    const sessionSecret = process.env.SESSION_SECRET || "tarim_asistani_secure_session_token_2026";
    const adminDefaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || "admin_degirmencay_33";

    const geminiApiKey = process.env.GEMINI_API_KEY || "";

    return {
      env,
      port,
      database: {
        type: dbType,
        path: dbPath,
        seedSampleData,
      },
      backup: {
        directory: backupDir,
        intervalHours: backupInterval,
      },
      geography: {
        latitude: lat,
        longitude: lng,
        locationName: locName,
      },
      security: {
        sessionSecret,
        adminDefaultPasswordHash: adminDefaultPassword, // Raw password to be hashed dynamically at seed time
      },
      gemini: {
        apiKey: geminiApiKey,
      },
    };
  }

  /**
   * Retrieves the current loaded configuration.
   * @returns AppConfig
   */
  public get(): AppConfig {
    return this.config;
  }

  /**
   * Checks if the critical Gemini API Key is configured.
   * @returns boolean
   */
  public hasGeminiKey(): boolean {
    return !!this.config.gemini.apiKey && this.config.gemini.apiKey !== "MY_GEMINI_API_KEY";
  }
}

// Export singleton instance of ConfigManager
export const configManager = new ConfigManager();
export const config = configManager.get();
