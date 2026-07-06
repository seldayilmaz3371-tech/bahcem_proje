/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { aiRecommendationRepository } from "../../repositories/ai.repository";
import { parcelRepository } from "../../repositories/parcel.repository";
import { observationRepository, photoRepository } from "../../repositories/observation.repository";
import { inventoryItemRepository } from "../../repositories/inventory.repository";
import { db } from "../../database";
import { logger } from "../../logger";
import { config } from "../../config";
import { AIRecommendation } from "../../models";
import { weatherService } from "../weather.service";
import { photoStorageService } from "../photo-storage.service";
import { aiUsageTrackerService } from "../ai-usage-tracker.service";
import { capUserQueryLength } from "../../prompts/prompt-safety.util";
import { buildParcelRecommendationPrompt } from "../../prompts/parcel-recommendation.prompt";
import { getGeminiClient, callGeminiWithRetry } from "./gemini-client";
import { searchSimilarChunks } from "./rag-retrieval.service";

/**
 * Produces context-aware agricultural decision-support recommendations
 * for a specific parcel, integrating observation history, live/local
 * weather data, inventory stock levels, RAG knowledge-base articles, and
 * — optionally — up to 3 uploaded diagnosis photos.
 */
export class ParcelRecommendationService {
  /**
   * Generates a fully customized context-aware agricultural decision-support recommendation
   * for a specific plot, integrating sensor data, live weather data, inventory stocks, RAG
   * articles, and — optionally — up to 3 uploaded diagnosis photos.
   *
   * Gemini never acts as the final decision-maker here: it produces an
   * analysis, a probability/confidence-qualified diagnosis, and
   * source-labeled recommendations, but every dosage figure is presented
   * as approximate and the model is explicitly instructed to disclose
   * uncertainty rather than guess (see AI PHILOSOPHY / CONFIDENCE
   * principles). A proper rules-based Decision Engine that would
   * override or hard-validate dosage figures against verified product
   * data is a larger, separate initiative, deferred until per-product
   * dosage data exists in the inventory (see architecture notes).
   *
   * @param parcelId Target parcel identifier
   * @param userQuery Optional free-text question from the farmer
   * @param photoFiles Optional array of up to 3 diagnosis photos (raw buffer + MIME type)
   * @param requestedByUserId ID of the user submitting the request, required to persist photos
   */
  public async generateParcelRecommendation(
    parcelId: string,
    userQuery?: string,
    photoFiles?: Array<{ buffer: Buffer; mimeType: string }>,
    requestedByUserId?: string
  ): Promise<AIRecommendation | null> {
    try {
      const parcel = await parcelRepository.getById(parcelId);
      if (!parcel) {
        throw new Error("Ulaşılmaya çalışılan tarsel (parsel) kaydı bulunamadı.");
      }

      const safeUserQuery = userQuery ? capUserQueryLength(userQuery) : undefined;
      const hasPhotos = !!photoFiles && photoFiles.length > 0;

      const allObservations = await observationRepository.getAll();
      const parcelObservations = allObservations
        .filter((o) => o.parcelId === parcelId)
        .sort((a, b) => new Date(b.observationDate).getTime() - new Date(a.observationDate).getTime())
        .slice(0, 5);

      const observationsContext = parcelObservations.length > 0
        ? parcelObservations.map((o, idx) => `[Gözlem ${idx + 1} - Tarih: ${o.observationDate}]: ${o.notes}`).join("\n")
        : "Bu parsel için yakın zamanda kaydedilmiş gözlem raporu bulunmuyor.";

      const rawDb = await db.readRaw();
      const weatherHistory = rawDb.weatherHistory || [];
      const recentWeather = weatherHistory
        .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime())
        .slice(0, 5);

      const localWeatherContext = recentWeather.length > 0
        ? recentWeather.map((w) => `[Tarih: ${w.recordDate}]: En Yüksek Sıcaklık: ${w.tempMax}°C, En Düşük Sıcaklık: ${w.tempMin}°C, Nem: %${w.humidity}, Don Riski Var Mı: ${w.hasFrostRisk ? "EVET" : "HAYIR"}`).join("\n")
        : "Yerel veritabanında manuel olarak kaydedilmiş yakın zamana ait meteorolojik veri bulunmamaktadır.";

      const allInventory = await inventoryItemRepository.getAll();
      const stockAlerts = allInventory.filter((item) => item.stockQuantity <= item.minStockAlert);
      const inventoryContext = stockAlerts.length > 0
        ? stockAlerts.map((i) => `- ${i.name} (Stokta: ${i.stockQuantity} ${i.unit}, Kritik Seviye: ${i.minStockAlert} ${i.unit})`).join("\n")
        : "Tüm gübre ve ilaç stok seviyeleri güvenli eşiğin üzerindedir.";

      const querySearchTerm = safeUserQuery
        ? safeUserQuery
        : hasPhotos
          ? "zeytin hastalık zararlı teşhis ilaç tedavi bakır sülfat"
          : "Mersin Toroslar Değirmençay zeytin yetiştiriciliği sulama gübreleme hastalık koruma";

      // The live weather forecast (external HTTP call) and the RAG
      // similarity search (embedding API call) are fully independent of
      // one another — running them concurrently instead of sequentially
      // reduces total latency to roughly the slower of the two, rather
      // than their sum.
      const [liveWeather, similarChunks] = await Promise.all([
        weatherService.getWeatherSummaryForAI(),
        searchSimilarChunks(querySearchTerm, 3),
      ]);

      const ragContext = similarChunks.length > 0
        ? similarChunks.map((m, idx) => `[RAG Kaynak ${idx + 1} - Güven Skoru: ${(m.score * 100).toFixed(1)}%]: ${m.chunk.content}`).join("\n")
        : "Bilgi deposunda zeytin tarımıyla ilgili eşleşen makale bulunamadı.";

      // If diagnosis photos were attached, persist them permanently
      // through the existing Observation/Photo infrastructure (identical
      // to Saha Gözlemleri uploads) so they also appear in this parcel's
      // observation history and become eligible for Fotoğraflı Gelişim
      // Analizi later. A failure to persist a given photo is logged and
      // skipped rather than aborting the whole recommendation.
      let photosUsedCount = 0;
      if (hasPhotos && requestedByUserId) {
        const photoObservation = await observationRepository.create({
          parcelId,
          observerId: requestedByUserId,
          observationDate: new Date().toISOString(),
          activityType: "Genel Gözlem",
          notes: `Yapay Zeka Karar Destek raporu için yüklenen teşhis fotoğrafı.${safeUserQuery ? ` Soru: "${safeUserQuery}"` : ""}`,
          createdAt: new Date().toISOString(),
        });

        for (const file of photoFiles!) {
          try {
            const dataUrl = `data:${file.mimeType};base64,${file.buffer.toString("base64")}`;
            const saved = photoStorageService.saveNewPhoto(dataUrl);
            await photoRepository.create({
              id: saved.photoId,
              observationId: photoObservation.id,
              originalUrl: saved.relativeUrl,
              thumbnailUrl: saved.relativeUrl,
              takenAt: new Date().toISOString(),
              fileSize: saved.fileSizeBytes,
              contentHash: saved.contentHash,
              createdAt: new Date().toISOString(),
            });
            photosUsedCount++;
          } catch (photoError) {
            logger.error("AI", "Teşhis fotoğrafı kalıcı olarak kaydedilemedi, atlanıyor.", photoError);
          }
        }
      }

      const prompt = buildParcelRecommendationPrompt({
        parcelName: parcel.name,
        areaDekar: parcel.areaDekar,
        treeCount: parcel.treeCount,
        soilType: parcel.soilType,
        irrigationType: parcel.irrigationType,
        observationsContext,
        localWeatherContext,
        liveWeatherText: liveWeather.text,
        inventoryContext,
        ragContext,
        userQuery: safeUserQuery || "",
        hasPhotos,
        photosUsedCount,
      });

      const client = getGeminiClient();
      let responseText: string | undefined;

      if (hasPhotos) {
        const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [
          { text: prompt },
        ];
        for (const file of photoFiles!) {
          parts.push({ inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimeType } });
        }
        const response = await callGeminiWithRetry(() => {
          aiUsageTrackerService.recordUsage(config.ai.generationModel);
          return client.models.generateContent({
            model: config.ai.generationModel,
            contents: parts,
          });
        });
        responseText = response.text;
      } else {
        const response = await callGeminiWithRetry(() => {
          aiUsageTrackerService.recordUsage(config.ai.generationModel);
          return client.models.generateContent({
            model: config.ai.generationModel,
            contents: prompt,
          });
        });
        responseText = response.text;
      }

      if (!responseText) {
        throw new Error("Yapay zeka asistanından boş bir cevap döndü.");
      }

      let score = 0.85;
      if (similarChunks.length > 0) {
        score = Math.max(score, similarChunks[0].score);
      }
      if (!liveWeather.available) {
        score = Math.max(0.5, score - 0.1);
      }
      if (hasPhotos && similarChunks.length === 0) {
        score = Math.max(0.5, score - 0.15);
      }

      const timestamp = new Date().toISOString();
      const recommendation = await aiRecommendationRepository.create({
        parcelId,
        recommendationType: hasPhotos ? "Hastalık" : "Genel",
        content: responseText.trim(),
        confidenceScore: parseFloat(score.toFixed(2)),
        usedDocumentsCount: similarChunks.length,
        usedObservationsCount: parcelObservations.length,
        usedWeatherCount: recentWeather.length + liveWeather.daysUsed,
        usedInventoryCount: allInventory.length,
        createdDate: timestamp,
      });

      logger.info(
        "AI",
        `Generated customized expert advisory report for parcel: '${parcel.name}'. Canlı hava durumu kullanıldı: ${liveWeather.available ? "EVET" : "HAYIR"}. Teşhis fotoğrafı sayısı: ${photosUsedCount}.`
      );
      return recommendation;
    } catch (error) {
      logger.error("AI", `Failed to generate recommendation for parcel ID: '${parcelId}'`, error);
      return null;
    }
  }
}

export const parcelRecommendationService = new ParcelRecommendationService();
