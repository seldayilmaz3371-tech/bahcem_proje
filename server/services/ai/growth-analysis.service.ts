/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../logger";
import { config } from "../../config";
import { AIRecommendation, Photo, PhotoAiAnalysis } from "../../models";
import { parcelRepository } from "../../repositories/parcel.repository";
import { photoRepository } from "../../repositories/observation.repository";
import { aiRecommendationRepository } from "../../repositories/ai.repository";
import { aiUsageTrackerService } from "../ai-usage-tracker.service";
import { capUserQueryLength } from "../../prompts/prompt-safety.util";
import { buildGrowthAnalysisPrompt } from "../../prompts/growth-analysis.prompt";
import { getGeminiClient, callGeminiWithRetry } from "./gemini-client";
import { photoAnalysisService } from "./photo-analysis.service";

/** Maximum number of photos sent into a single growth-comparison prompt. */
const MAX_GROWTH_ANALYSIS_PHOTOS = 12;

/**
 * Analyzes the visual development of a parcel over a date range by
 * combining per-photo structured analyses (see PhotoAnalysisService)
 * into a single narrative comparison.
 */
export class GrowthAnalysisService {
  /**
   * Analyzes the visual development of a parcel over a date range.
   *
   * Each photo's image is sent to Gemini's vision model AT MOST ONCE,
   * ever — the resulting structured analysis (growth stage, health
   * score, disease indication, confidence) is persisted on the Photo
   * record and reused for every subsequent growth-analysis request that
   * covers the same photo, including overlapping or repeated date
   * ranges. A separate, purely text-based Gemini call then synthesizes
   * these stored structured summaries into a narrative comparison — this
   * step never includes any raw image data.
   *
   * @param parcelId Target parcel identifier
   * @param startDate ISO date string (inclusive) marking the start of the range
   * @param endDate ISO date string (inclusive) marking the end of the range
   * @param userQuery Optional free-text focus question from the farmer
   */
  public async generateGrowthAnalysis(
    parcelId: string,
    startDate: string,
    endDate: string,
    userQuery?: string
  ): Promise<{ recommendation: AIRecommendation; photosUsed: Photo[] } | null> {
    try {
      const parcel = await parcelRepository.getById(parcelId);
      if (!parcel) {
        throw new Error("Analiz istenen parsel kaydı bulunamadı.");
      }

      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
        throw new Error("Geçersiz tarih aralığı formatı.");
      }
      if (rangeStart.getTime() > rangeEnd.getTime()) {
        throw new Error("Başlangıç tarihi, bitiş tarihinden sonra olamaz.");
      }

      const allParcelPhotos = await photoRepository.getPhotosByParcelId(parcelId);

      const rangeEndInclusive = new Date(rangeEnd);
      rangeEndInclusive.setHours(23, 59, 59, 999);

      const photosInRange = allParcelPhotos
        .filter((p) => {
          const photoDate = new Date(p.takenAt || p.createdAt);
          return photoDate.getTime() >= rangeStart.getTime() && photoDate.getTime() <= rangeEndInclusive.getTime();
        })
        .sort((a, b) => new Date(a.takenAt || a.createdAt).getTime() - new Date(b.takenAt || b.createdAt).getTime());

      if (photosInRange.length < 2) {
        throw new Error(
          `Seçilen tarih aralığında karşılaştırma yapabilmek için en az 2 fotoğraf gerekiyor. Bulunan fotoğraf sayısı: ${photosInRange.length}. Lütfen Saha Gözlemleri bölümünden bu parsele daha fazla fotoğraf ekleyin veya tarih aralığını genişletin.`
        );
      }

      const sampledPhotos = this.sampleEvenly(photosInRange, MAX_GROWTH_ANALYSIS_PHOTOS);

      // Ensure every sampled photo has a structured analysis. Photos
      // already analyzed (in this or any previous request) cost nothing
      // here; only genuinely new photos result in a Gemini vision call.
      const photoAnalyses = new Map<string, PhotoAiAnalysis>();
      for (const photo of sampledPhotos) {
        const analysis = await photoAnalysisService.analyzePhotoOnce(photo, parcel.cropType);
        photoAnalyses.set(photo.id, analysis);
      }

      const dateFormatter = new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "long", day: "numeric" });
      const photoSummaries = sampledPhotos
        .map((photo) => this.formatPhotoAnalysisLine(photo, photoAnalyses.get(photo.id)!, dateFormatter))
        .join("\n");

      const safeUserQuery = userQuery ? capUserQueryLength(userQuery) : undefined;
      const prompt = buildGrowthAnalysisPrompt(
        parcel.name,
        parcel.cropType,
        parcel.areaDekar,
        parcel.treeCount,
        dateFormatter.format(rangeStart),
        dateFormatter.format(rangeEnd),
        photoSummaries,
        safeUserQuery
      );

      const client = getGeminiClient();
      const response = await callGeminiWithRetry(() => {
        aiUsageTrackerService.recordUsage(config.ai.generationModel);
        return client.models.generateContent({
          model: config.ai.generationModel,
          contents: prompt,
        });
      });

      if (!response.text) {
        throw new Error("Yapay zeka asistanından fotoğraf analizi için boş bir cevap döndü.");
      }

      // The overall report's confidence reflects the least certain photo
      // analysis it relies on — a strong narrative built partly on an
      // uncertain data point should not be presented as fully confident.
      const analysesUsed = Array.from(photoAnalyses.values());
      const overallConfidence = analysesUsed.length > 0
        ? Math.min(...analysesUsed.map((a) => a.confidence))
        : 0.5;

      const timestamp = new Date().toISOString();
      const recommendation = await aiRecommendationRepository.create({
        parcelId,
        recommendationType: "Gelişim Analizi",
        content: response.text.trim(),
        confidenceScore: parseFloat(Math.max(0.5, overallConfidence).toFixed(2)),
        usedDocumentsCount: 0,
        usedObservationsCount: 0,
        usedWeatherCount: 0,
        usedInventoryCount: 0,
        createdDate: timestamp,
      });

      logger.info(
        "AI",
        `Fotoğraf tabanlı gelişim analizi üretildi. Parsel: '${parcel.name}', kullanılan fotoğraf sayısı: ${sampledPhotos.length}/${photosInRange.length}.`
      );

      return { recommendation, photosUsed: sampledPhotos };
    } catch (error) {
      logger.error("AI", `Gelişim analizi başarısız oldu. Parsel ID: '${parcelId}'`, error);
      throw error;
    }
  }

  /**
   * Formats a single photo's structured analysis into one line of the
   * text summary block sent to the growth-comparison prompt.
   */
  private formatPhotoAnalysisLine(photo: Photo, analysis: PhotoAiAnalysis, dateFormatter: Intl.DateTimeFormat): string {
    const photoDate = new Date(photo.takenAt || photo.createdAt);
    const uncertainNote = analysis.isUncertain ? " [BELİRSİZ — düşük güven, dikkatli yorumla]" : "";
    const healthText = analysis.healthScore !== null ? `${analysis.healthScore}/100` : "değerlendirilemedi";
    const diseaseText = analysis.diseaseIndication || "belirti yok";

    return `[${dateFormatter.format(photoDate)}] Büyüme Evresi: ${analysis.growthStage} | Sağlık: ${healthText} | Hastalık/Zararlı: ${diseaseText} | Güven: %${Math.round(analysis.confidence * 100)}${uncertainNote}`;
  }

  /**
   * Selects up to `maxCount` items evenly spread across a chronologically
   * sorted array, always preserving the first and last elements so the
   * model can always compare the true start and end state.
   */
  private sampleEvenly<T>(items: T[], maxCount: number): T[] {
    if (items.length <= maxCount) {
      return items;
    }
    if (maxCount <= 1) {
      return [items[0]];
    }

    const result: T[] = [];
    const step = (items.length - 1) / (maxCount - 1);
    for (let i = 0; i < maxCount; i++) {
      const index = Math.round(i * step);
      result.push(items[index]);
    }
    return Array.from(new Set(result));
  }
}

export const growthAnalysisService = new GrowthAnalysisService();
