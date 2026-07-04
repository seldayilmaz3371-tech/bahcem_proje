/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { PROJECT_ROOT, config } from "../config";
import { logger } from "../logger";

const USAGE_FILE_PATH = path.join(PROJECT_ROOT, "data", "ai-usage.json");
const PACIFIC_TIME_ZONE = "America/Los_Angeles";

/**
 * Per-model daily usage record persisted to disk.
 */
interface PersistedModelUsage {
  pacificDate: string;
  count: number;
}

type PersistedUsageMap = Record<string, PersistedModelUsage>;

/**
 * Publicly reported usage for a single Gemini model. `dailyLimit`,
 * `remaining`, and `percentageUsed` are `null` whenever this model's
 * daily quota is not known to the application (see
 * AiUsageTrackerService's class documentation for why Google does not
 * expose this value programmatically).
 */
export interface ModelUsage {
  modelName: string;
  usedToday: number;
  dailyLimit: number | null;
  remaining: number | null;
  percentageUsed: number | null;
}

/**
 * Complete usage snapshot returned to API consumers.
 */
export interface AiUsageSnapshot {
  pacificDate: string;
  models: ModelUsage[];
}

/**
 * AI Usage Tracker Service.
 *
 * Tracks how many Gemini API requests have been made today, per model,
 * against known daily quota limits.
 *
 * IMPORTANT — why this exists as a self-reported counter: as of July
 * 2026, Google does not publish a reliable, programmatically queryable
 * endpoint for a free-tier project's remaining daily quota. The only
 * confirmed way this application has ever learned its actual limit was
 * by reading the "limit: 20" figure out of a real 429 RESOURCE_EXHAUSTED
 * error response. Because of this, the numbers this service reports are
 * an ESTIMATE based on requests this application itself has recorded —
 * not a guaranteed-accurate figure sourced from Google. Consumers of
 * this data (API responses, UI) must present it as an estimate, never
 * as a certain fact, per this project's confidence-disclosure principle.
 *
 * Daily reset boundary is anchored to Pacific Time (America/Los_Angeles),
 * matching Google's documented Requests-Per-Day (RPD) reset schedule,
 * rather than the server's own local time zone — otherwise the counter
 * would drift out of sync with Google's actual reset and become
 * misleading over time.
 *
 * This is a standalone service — not folded into AIService — because it
 * owns independent persisted state on disk, is invoked from multiple
 * unrelated call sites within the AI layer (every embedding and every
 * text/multimodal generation call), and its date-boundary logic is
 * unrelated to prompt construction or Gemini client management.
 */
export class AiUsageTrackerService {
  /**
   * Known daily request quotas (RPD), keyed by model name. A model name
   * absent from this map is still tracked (its usage count is recorded),
   * but reported with an unknown (null) limit rather than a guessed one.
   */
  private readonly dailyLimitsByModel: Readonly<Record<string, number>>;

  constructor() {
    this.dailyLimitsByModel = {
      [config.ai.generationModel]: config.ai.dailyQuotaLimit,
    };
  }

  /**
   * Records one API request against the given model's daily counter.
   * Must be called once per actual outbound request to the Gemini API,
   * regardless of whether that request ultimately succeeds — Google
   * counts the request against quota the moment it is received, not
   * only when it completes successfully.
   * @param modelName The Gemini model identifier that was called (e.g. "gemini-3.5-flash")
   */
  public recordUsage(modelName: string): void {
    const usageMap = this.loadUsageMap();
    const today = this.getCurrentPacificDate();
    const existingEntry = usageMap[modelName];
    const isSameDay = existingEntry?.pacificDate === today;

    usageMap[modelName] = {
      pacificDate: today,
      count: isSameDay ? existingEntry.count + 1 : 1,
    };

    this.saveUsageMap(usageMap);
  }

  /**
   * Returns today's usage snapshot for every model that has recorded at
   * least one request, evaluated against the current Pacific Time date.
   * A model whose stored record is from a previous Pacific day is
   * reported as zero usage (the daily window has effectively rolled
   * over), without requiring an explicit reset operation.
   */
  public getUsageSnapshot(): AiUsageSnapshot {
    const usageMap = this.loadUsageMap();
    const today = this.getCurrentPacificDate();

    const models: ModelUsage[] = Object.entries(usageMap).map(([modelName, usage]) =>
      this.buildModelUsage(modelName, usage, today)
    );

    return { pacificDate: today, models };
  }

  /**
   * Converts a single persisted usage record into its public reporting
   * shape, applying the known daily limit (if any) for that model.
   */
  private buildModelUsage(modelName: string, usage: PersistedModelUsage, today: string): ModelUsage {
    const usedToday = usage.pacificDate === today ? usage.count : 0;
    const dailyLimit = this.dailyLimitsByModel[modelName] ?? null;

    if (dailyLimit === null) {
      return { modelName, usedToday, dailyLimit: null, remaining: null, percentageUsed: null };
    }

    return {
      modelName,
      usedToday,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - usedToday),
      percentageUsed: Math.min(100, Math.round((usedToday / dailyLimit) * 100)),
    };
  }

  /**
   * Computes today's calendar date in Pacific Time, matching Google's
   * documented Gemini API daily quota reset schedule.
   * @returns Date string in "YYYY-MM-DD" format
   */
  private getCurrentPacificDate(): string {
    // The "en-CA" locale is used deliberately: it is one of the few
    // built-in Intl locales that formats dates as YYYY-MM-DD, which is
    // exactly the sortable, unambiguous format this service needs.
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: PACIFIC_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date());
  }

  /**
   * Reads the persisted usage map from disk, returning an empty map if
   * the file does not yet exist or cannot be parsed. A read failure is
   * logged but never thrown — usage tracking must never be able to
   * crash the application or block an actual AI request.
   */
  private loadUsageMap(): PersistedUsageMap {
    try {
      if (!fs.existsSync(USAGE_FILE_PATH)) {
        return {};
      }
      const content = fs.readFileSync(USAGE_FILE_PATH, "utf8");
      return JSON.parse(content) as PersistedUsageMap;
    } catch (error) {
      logger.error("AI", "AI kullanım sayacı dosyası okunamadı, boş sayaçla devam ediliyor.", error);
      return {};
    }
  }

  /**
   * Writes the usage map to disk using an atomic write-then-rename
   * pattern, consistent with the rest of the application's file
   * persistence strategy (see PhotoStorageService, BackupService).
   */
  private saveUsageMap(usageMap: PersistedUsageMap): void {
    try {
      const dir = path.dirname(USAGE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${USAGE_FILE_PATH}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(usageMap, null, 2), "utf8");
      fs.renameSync(tempPath, USAGE_FILE_PATH);
    } catch (error) {
      logger.error("AI", "AI kullanım sayacı diske yazılamadı.", error);
    }
  }
}

export const aiUsageTrackerService = new AiUsageTrackerService();
