/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { logger } from "../../logger";

let aiClient: GoogleGenAI | null = null;

/**
 * Returns a lazily initialized Gemini API client.
 * Follows security guidelines by avoiding load-time crashes if key is missing.
 */
export function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error(
      "Yapay zeka asistanını ve RAG (Doküman Havuzu) özelliklerini kullanabilmek için lütfen sol menüdeki Settings > Secrets kısmından geçerli bir GEMINI_API_KEY anahtarı ekleyin."
    );
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

/** Maximum number of retry attempts for a transient Gemini API failure (does not count the initial attempt). */
const MAX_GEMINI_RETRY_ATTEMPTS = 2;

/** Base delay before the first retry; doubles on each subsequent attempt (exponential backoff). */
const GEMINI_RETRY_BASE_DELAY_MS = 1000;

/**
 * Determines whether a failed Gemini call is worth retrying. Quota
 * exhaustion (429 / RESOURCE_EXHAUSTED) and client-side request errors
 * (400/401/403) will fail identically on every retry — retrying them
 * only wastes additional quota and time, so they are excluded. Only
 * transient failures (network errors, 5xx server errors) are retried.
 */
function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const nonRetryableMarkers = ["RESOURCE_EXHAUSTED", "\"code\":429", "\"code\":400", "\"code\":401", "\"code\":403"];
  return !nonRetryableMarkers.some((marker) => message.includes(marker));
}

/**
 * Executes a Gemini API call with a small number of retries using
 * exponential backoff, limited to transient failures (see
 * isRetryableGeminiError). Per HATA YÖNETİMİ, this does not change what
 * happens on final failure — the caller's own try/catch still handles it
 * exactly as before; this only gives a transient failure a chance to
 * self-resolve before giving up. `operation` should include any
 * AiUsageTrackerService.recordUsage call, since each retry is a genuine
 * additional request that consumes quota.
 */
export async function callGeminiWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_GEMINI_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === MAX_GEMINI_RETRY_ATTEMPTS;
      if (isLastAttempt || !isRetryableGeminiError(error)) {
        throw error;
      }

      const delayMs = GEMINI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      logger.warn(
        "AI",
        `Gemini çağrısı geçici bir hatayla başarısız oldu, ${delayMs}ms sonra yeniden denenecek (deneme ${attempt + 1}/${MAX_GEMINI_RETRY_ATTEMPTS}).`,
        { error: error instanceof Error ? error.message : String(error) }
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
