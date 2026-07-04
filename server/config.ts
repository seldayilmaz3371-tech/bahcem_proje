/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file
dotenv.config();

/**
 * Resolves the project's root directory based on this file's actual
 * location on disk, rather than the process's current working directory
 * (`process.cwd()`).
 *
 * Rationale: `process.cwd()` reflects whatever directory the Node.js
 * process happened to be launched from. If the server is started via a
 * shortcut, a scheduled task, or a batch file that does not explicitly
 * `cd` into the project folder first, `process.cwd()` can silently point
 * to an unrelated directory (e.g. the user's Desktop). Every default path
 * in this file previously derived from `process.cwd()`, which meant such
 * a launch would cause the application to bootstrap a brand-new, empty
 * database, photo storage folder, and backup directory in the wrong
 * location — while the real data remained completely untouched and safe
 * in the actual project folder, invisible to the running application.
 *
 * This file lives at `<project-root>/server/config.ts`, so the project
 * root is always exactly one directory above this file's own location,
 * regardless of where the process was launched from.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Absolute path to the project's root directory, derived from this
 * file's own on-disk location rather than the process's working
 * directory. Exported so other modules (logger, session storage, static
 * file serving, etc.) can anchor their own default paths to the same
 * reliable reference point instead of depending on `process.cwd()`,
 * which varies depending on how the process was launched.
 */
export const PROJECT_ROOT = path.resolve(__dirname, "..");

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
    maxSnapshotsToKeep: number;
    googleDriveSyncPath: string;
  };
  storage: {
    photosDirectory: string;
  };
  /**
   * Configuration strictly required for AI usage tracking (see
   * AiUsageTrackerService). This intentionally does NOT yet centralize
   * every hardcoded Gemini model name used across ai.service.ts — that
   * broader migration is a separate, deferred task. `generationModel`
   * exists here only so the usage tracker and the service that calls
   * Gemini agree on the same model identifier as a single source of truth.
   */
  ai: {
    generationModel: string;
    embeddingModel: string;
    /**
     * Known daily request quota (RPD) for `generationModel` on the
     * current Gemini API tier. Google does not expose a live endpoint to
     * query this value, so it must be kept in sync manually if the
     * project's tier or Google's published limits change (see
     * https://ai.google.dev/gemini-api/docs/rate-limits).
     */
    dailyQuotaLimit: number;
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
   * Ensures zero hardcoded secrets and high maintainability. All default
   * filesystem paths are anchored to PROJECT_ROOT (derived from this
   * file's own location) rather than the process's working directory, so
   * the application always finds the correct data regardless of how or
   * from where it was launched.
   * @returns AppConfig object
   */
  private loadConfig(): AppConfig {
    const env = process.env.NODE_ENV || "development";
    const port = parseInt(process.env.PORT || "3000", 10);
    const dbType = process.env.DATABASE_TYPE || "local_json";
    const dbPath = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, "data", "tarim_hafizasi.json");
    const backupDir = process.env.BACKUP_DIR || path.join(PROJECT_ROOT, "backups");
    const backupInterval = parseInt(process.env.BACKUP_INTERVAL_HOURS || "24", 10);

    // Maximum number of timestamped database snapshots to retain before
    // the oldest ones are automatically pruned. Prevents the backups
    // folder from growing without bound over time.
    const backupMaxSnapshots = parseInt(process.env.BACKUP_MAX_SNAPSHOTS || "30", 10);

    // Optional absolute path to a locally synced Google Drive folder
    // (created by the Google Drive for Desktop application). When set,
    // every backup is additionally copied into this folder, and Google
    // Drive's own client uploads it to the cloud automatically. No
    // Google API credentials are required with this approach. Left empty
    // to disable cloud mirroring and keep backups local-only.
    const googleDriveSyncPath = (process.env.GOOGLE_DRIVE_BACKUP_PATH || "").trim();

    // Controls whether the bundled Mersin Değirmençay showcase/demo data
    // (sample parcels, trees, costs, sales, harvests, notifications, etc.)
    // is automatically generated on a fresh/empty database. Defaults to
    // "false" so production deployments always start with a clean,
    // user-owned dataset. Set to "true" only for local demos or onboarding.
    const seedSampleData = (process.env.SEED_SAMPLE_DATA || "false").trim().toLowerCase() === "true";

    // Directory where uploaded field-observation photos are stored as
    // individual files on disk, rather than embedded as base64 text
    // inside the main JSON database. Keeps the primary database file
    // small and fast regardless of how many photos are collected.
    const photosDirectory = process.env.PHOTOS_STORAGE_DIR || path.join(PROJECT_ROOT, "data", "photos");

    // Model identifier used for text/multimodal generation, and its known
    // free-tier daily request quota (confirmed 20/day via an actual 429
    // RESOURCE_EXHAUSTED response from the Gemini API on 2026-07-03).
    const generationModel = process.env.AI_GENERATION_MODEL || "gemini-3.5-flash";
    const embeddingModel = process.env.AI_EMBEDDING_MODEL || "gemini-embedding-2-preview";
    const dailyQuotaLimit = parseInt(process.env.AI_DAILY_QUOTA_LIMIT || "20", 10);

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
        maxSnapshotsToKeep: backupMaxSnapshots,
        googleDriveSyncPath,
      },
      storage: {
        photosDirectory,
      },
      ai: {
        generationModel,
        embeddingModel,
        dailyQuotaLimit,
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
