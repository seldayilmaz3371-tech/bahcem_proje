/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SystemSetting } from "../models";
import { db } from "../database";
import { logger } from "../logger";

/**
 * System Settings & Regional Agriculture Parameter Service.
 * Manages UI options, theme selection, language packages, and critical geographic
 * variables of Değirmençay / Toroslar plots.
 */
export class SettingService {
  /**
   * Retrieves all settings from the database.
   */
  public async getAll(): Promise<SystemSetting[]> {
    try {
      const rawDb = await db.readRaw();
      return rawDb.settings || [];
    } catch (error) {
      logger.error("SYSTEM", "Failed to retrieve settings list.", error);
      return [];
    }
  }

  /**
   * Retrieves an option value by its key.
   * If not found, returns the designated fallback default value.
   * @param key Config option key
   * @param fallback Default value fallback
   */
  public async getSetting(key: string, fallback = ""): Promise<string> {
    try {
      const all = await this.getAll();
      const match = all.find((s) => s.key === key);
      return match ? match.value : fallback;
    } catch (error) {
      logger.error("SYSTEM", `Failed to load setting '${key}' from database.`, error);
      return fallback;
    }
  }

  /**
   * Sets or updates a configuration setting value under transaction guard.
   * @param key Config key
   * @param value New value to assign
   */
  public async setSetting(key: string, value: string): Promise<boolean> {
    try {
      let success = false;
      const timestamp = new Date().toISOString();

      await db.transaction((rawDb) => {
        const settings = rawDb.settings || [];
        const index = settings.findIndex((s) => s.key === key);

        if (index !== -1) {
          settings[index].value = value;
          settings[index].updatedAt = timestamp;
          success = true;
        } else {
          settings.push({ key, value, updatedAt: timestamp });
          success = true;
        }
      });

      if (success) {
        logger.info("SYSTEM", `System setting updated: '${key}' = '${value}'`);
      }
      return success;
    } catch (error) {
      logger.error("SYSTEM", `Failed to set configuration key '${key}'`, error);
      return false;
    }
  }

  /**
   * Retrieves all key-value settings as a clean dictionary object.
   */
  public async getSettingsDict(): Promise<Record<string, string>> {
    const list = await this.getAll();
    const dict: Record<string, string> = {};
    for (const item of list) {
      dict[item.key] = item.value;
    }
    return dict;
  }
}

export const settingService = new SettingService();
