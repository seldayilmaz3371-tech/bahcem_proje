/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../logger";
import { config } from "../../config";
import { Photo, PhotoAiAnalysis } from "../../models";
import { photoRepository } from "../../repositories/observation.repository";
import { photoStorageService } from "../photo-storage.service";
import { aiUsageTrackerService } from "../ai-usage-tracker.service";
import { isUncertainAnalysis } from "../growth-scoring.util";
import { buildPhotoAnalysisPrompt, photoAnalysisResponseSchema } from "../../prompts/photo-analysis.prompt";
import { getGeminiClient, callGeminiWithRetry } from "./gemini-client";

/**
 * Ensures every distinct photo receives at most one Gemini vision call,
 * persisting and reusing the structured result across all future
 * requests (chat, growth analysis, direct observation uploads).
 */
export class PhotoAnalysisService {
  /**
   * Ensures a single photo has a structured AI analysis, computing it at
   * most once per distinct image. Resolution order:
   * 1. If this exact Photo record already has `aiAnalysis`, return it —
   *    no API call.
   * 2. If another photo with the same `contentHash` already has an
   *    analysis (the identical image was uploaded more than once), copy
   *    that result onto this record — no API call.
   * 3. Otherwise, send this photo's image to Gemini exactly once,
   *    persist the structured result, and return it.
   *
   * A failure to analyze (Gemini error, malformed JSON response) never
   * throws — it returns a clearly-marked "Belirsiz"/uncertain analysis
   * instead, so one bad photo can never crash an entire growth report
   * (see HATA YÖNETİMİ: AI başarısız olursa sistem çökmemeli).
   *
   * Public (not private) because it has two legitimate call sites:
   * `generateGrowthAnalysis` (batch analysis over a date range) and the
   * `/api/observations/upload-photo` route (immediate analysis when a
   * photo is uploaded directly to a "Referans Ağaç" — see server.ts).
   * Both reuse this exact same logic; neither duplicates it.
   * @param photo The photo to ensure an analysis for
   * @param cropType The parcel's crop type, for prompt context
   */
  public async analyzePhotoOnce(photo: Photo, cropType: string): Promise<PhotoAiAnalysis> {
    if (photo.aiAnalysis) {
      return photo.aiAnalysis;
    }

    if (photo.contentHash) {
      const duplicate = await photoRepository.findAnalyzedPhotoByContentHash(photo.contentHash);
      if (duplicate?.aiAnalysis) {
        await photoRepository.update(photo.id, { aiAnalysis: duplicate.aiAnalysis });
        logger.info("AI", `Fotoğraf daha önce analiz edilmiş bir kopyayla eşleşti, Gemini çağrısı atlandı. Photo ID: ${photo.id}`);
        return duplicate.aiAnalysis;
      }
    }

    const fallbackAnalysis: PhotoAiAnalysis = {
      growthStage: "Belirsiz",
      healthScore: null,
      diseaseIndication: null,
      confidence: 0,
      isUncertain: true,
      analyzedAt: new Date().toISOString(),
    };

    const inlineData = photoStorageService.readPhotoAsInlineData(photo.originalUrl);
    if (!inlineData) {
      logger.error("AI", `Fotoğraf verisi okunamadı, belirsiz analiz döndürülüyor. Photo ID: ${photo.id}`);
      return fallbackAnalysis;
    }

    try {
      const client = getGeminiClient();
      const response = await callGeminiWithRetry(() => {
        aiUsageTrackerService.recordUsage(config.ai.generationModel);
        return client.models.generateContent({
          model: config.ai.generationModel,
          contents: [
            { text: buildPhotoAnalysisPrompt(cropType) },
            { inlineData: { data: inlineData.base64Data, mimeType: inlineData.mimeType } },
          ],
        });
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error("Gemini boş bir yanıt döndürdü.");
      }

      // Gemini is instructed to return raw JSON, but defensively strip
      // markdown code fences in case they are included anyway.
      const cleanedText = rawText.replace(/^```json\s*|```\s*$/g, "").trim();
      const rawParsed: unknown = JSON.parse(cleanedText);

      // Formal runtime validation (not a compile-time-only type
      // assertion) — an AI response must never be trusted as-is (see
      // GÜVENLİK). Every field independently falls back to a safe
      // default via the schema's .catch() rules if Gemini's response is
      // missing a field, uses an unexpected type, or falls outside the
      // valid range.
      const validated = photoAnalysisResponseSchema.parse(rawParsed);

      const analysis: PhotoAiAnalysis = {
        growthStage: validated.growthStage,
        healthScore: validated.healthScore,
        diseaseIndication: validated.diseaseIndication,
        confidence: validated.confidence,
        isUncertain: isUncertainAnalysis(validated.confidence),
        analyzedAt: new Date().toISOString(),
      };

      await photoRepository.update(photo.id, { aiAnalysis: analysis });
      return analysis;
    } catch (error) {
      logger.error("AI", `Fotoğraf analizi başarısız oldu, belirsiz analiz döndürülüyor. Photo ID: ${photo.id}`, error);
      return fallbackAnalysis;
    }
  }
}

export const photoAnalysisService = new PhotoAnalysisService();
