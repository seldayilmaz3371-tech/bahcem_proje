/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { aiRecommendationRepository } from "../../repositories/ai.repository";
import { observationRepository, photoRepository } from "../../repositories/observation.repository";
import { logger } from "../../logger";
import { config } from "../../config";
import { AIRecommendation } from "../../models";
import { photoStorageService } from "../photo-storage.service";
import { aiUsageTrackerService } from "../ai-usage-tracker.service";
import { buildParcelRecommendationPrompt } from "../../prompts/parcel-recommendation.prompt";
import { getGeminiClient, callGeminiWithRetry } from "./gemini-client";
import { contextBuilderService } from "./context-builder.service";
import { intentRouterService } from "./intent-router.service";
import { confidenceService } from "./confidence.service";
import { decisionEngineService } from "./decision-engine.service";
import { createRealEvaluators } from "./evaluator-registry.service";
import { decisionExplanationBuilderService } from "./decision-explanation-builder.service";

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
    const pipelineStartTime = Date.now();
    try {
      const hasPhotos = !!photoFiles && photoFiles.length > 0;

      // Sprint 4A — context toplama artık ortak ContextBuilderService
      // üzerinden yapılıyor. Bu çağrı, ÖNCEKİ kodun bu fonksiyonun
      // içinde satır satır yaptığı TÜM toplama işlemlerinin (parsel,
      // gözlemler, hava durumu, envanter, RAG arama terimi + sonucu)
      // yerini alıyor — DAVRANIŞ (değerler, sıralama, metin formatları,
      // "zeytin" içeren varsayılan RAG arama terimi dahil) BİREBİR
      // AYNI kaldı, yalnızca toplama KODU ortak bir servise taşındı.
      const context = await contextBuilderService.buildContext({
        parcelId,
        userQuery,
        requestedByUserId,
        hasPhotos,
        ragLimit: 3,
      });

      if (!context.parcel) {
        throw new Error("Ulaşılmaya çalışılan tarsel (parsel) kaydı bulunamadı.");
      }
      const parcel = context.parcel;
      const safeUserQuery = context.safeUserQuery;

      // Sprint 4D — Intent Router. BİLİNÇLİ OLARAK yalnızca GÖZLEMSEL
      // (bkz. chat-assistant.service.ts'teki aynı entegrasyon) —
      // sonucu hiçbir koşullu dallanmaya yol açmıyor, yalnızca
      // loglanıyor. Karar Destek zaten kendi (parsel bağlamlı) akışını
      // izliyor; burada `hasParcelContext: true` geçilmesi, Intent
      // Router'ın "ParcelRecommendation" kuralının GERÇEK, mevcut bir
      // bağlamda doğru çalıştığını doğrulamak içindir.
      const intentResult = intentRouterService.classify({
        userMessage: safeUserQuery || "",
        hasParcelContext: true,
        cropType: parcel.cropType,
      });
      logger.info("AI", `Intent sınıflandırıldı: ${intentResult.intent}`, { matchedKeywords: intentResult.matchedKeywords, parcelId });

      const ragContext = context.ragMatches.length > 0
        ? context.ragMatches.map((m, idx) => `[RAG Kaynak ${idx + 1} - Güven Skoru: ${(m.score * 100).toFixed(1)}%]: ${m.chunk.content}`).join("\n")
        : "Bilgi deposunda zeytin tarımıyla ilgili eşleşen makale bulunamadı.";

      // Sprint 5F — Decision Engine Entegrasyonu (Failsafe).
      //
      // "Decision Engine KARAR VERİR, Gemini KARAR VERMEZ" ilkesinin
      // uygulaması: yalnızca context.plantName (parcel.cropType) ile
      // ÇALIŞABİLEN evaluator'lar (Weather/Phenology/Nutrition —
      // chemicalId/inventoryItemIds gerektirenler `supports()=false`
      // döner, mevcut Evaluator Framework MEKANİZMASI zaten bunu
      // otomatik hallediyor) çalıştırılır.
      //
      // Decision Engine HATA VERİRSE (ör. repository sorunları), bu
      // BLOK sessizce boş bırakılır ve prompt ESKİ (Decision Engine'siz)
      // haliyle devam eder — sistem asla çökmez (Failsafe, Sprint 4E'nin
      // runWithFallback deseniyle tutarlı).
      const decisionEngineStartTime = Date.now();
      let decisionEngineContext: string | undefined;
      let usedTemplateName: string | undefined;
      try {
        const decision = await decisionEngineService.run(createRealEvaluators(), { plantName: parcel.cropType });
        decisionEngineContext = decisionExplanationBuilderService.build(decision);
        // Sprint 5G — Görev: "hangi açıklama şablonu kullanıldı, açıklama uzunluğu" loglanmalı.
        usedTemplateName = decisionExplanationBuilderService.getSelectedTemplateName(decision);
      } catch (decisionError) {
        logger.error("AI", "Decision Engine çalıştırılamadı, Decision Engine bölümü olmadan devam ediliyor.", decisionError);
      }
      const decisionEngineDurationMs = Date.now() - decisionEngineStartTime;

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

      const promptBuilderStartTime = Date.now();
      const prompt = buildParcelRecommendationPrompt({
        parcelName: parcel.name,
        areaDekar: parcel.areaDekar,
        treeCount: parcel.treeCount,
        cropType: parcel.cropType,
        soilType: parcel.soilType,
        irrigationType: parcel.irrigationType,
        observationsContext: context.observationsContextText,
        localWeatherContext: context.localWeatherContextText,
        liveWeatherText: context.liveWeather.text,
        inventoryContext: context.inventoryContextText,
        ragContext,
        userQuery: safeUserQuery || "",
        hasPhotos,
        photosUsedCount,
        plantKnowledgeContext: context.plantKnowledgeContextText || undefined,
        decisionEngineContext,
      });
      const promptBuilderDurationMs = Date.now() - promptBuilderStartTime;

      const geminiStartTime = Date.now();
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

      const geminiDurationMs = Date.now() - geminiStartTime;

      if (!responseText) {
        throw new Error("Yapay zeka asistanından boş bir cevap döndü.");
      }

      let score = 0.85;
      if (context.ragMatches.length > 0) {
        score = Math.max(score, context.ragMatches[0].score);
      }
      if (!context.liveWeather.available) {
        score = Math.max(0.5, score - 0.1);
      }
      if (hasPhotos && context.ragMatches.length === 0) {
        score = Math.max(0.5, score - 0.15);
      }

      const timestamp = new Date().toISOString();

      // Sprint 4F — Confidence Model. Mevcut `score` (0-1, yukarıda,
      // DEĞİŞTİRİLMEDİ) hesaplamasından TAMAMEN BAĞIMSIZ, ayrı bir
      // 0-100 puan — Chat Assistant'ın kullandığı AYNI ortak
      // ConfidenceService üzerinden (Görev 7: kod tekrarına izin verme).
      const confidenceModel = confidenceService.calculate({
        intent: "ParcelRecommendation",
        usedGemini: true,
        usedRetrieval: true,
        usedPlantKnowledge: !!context.plantKnowledgeContextText,
        usedFallback: false,
        retrievalResultCount: context.ragMatches.length,
        retrievalScores: context.ragMatches.map((m) => m.score),
      });
      logger.info("AI", `Confidence hesaplandı: ${confidenceModel.confidence}/100`, { intent: "ParcelRecommendation", reasons: confidenceModel.reasons, parcelId });

      const recommendation = await aiRecommendationRepository.create({
        parcelId,
        recommendationType: hasPhotos ? "Hastalık" : "Genel",
        content: responseText.trim(),
        confidenceScore: parseFloat(score.toFixed(2)),
        usedDocumentsCount: context.ragMatches.length,
        usedObservationsCount: context.recentObservations.length,
        usedWeatherCount: context.recentWeather.length + context.liveWeather.daysUsed,
        usedInventoryCount: context.totalInventoryItemCount,
        createdDate: timestamp,
        confidenceModel,
      });

      logger.info(
        "AI",
        `Generated customized expert advisory report for parcel: '${parcel.name}'. Canlı hava durumu kullanıldı: ${context.liveWeather.available ? "EVET" : "HAYIR"}. Teşhis fotoğrafı sayısı: ${photosUsedCount}.`
      );

      // Sprint 5F — Görev: "Decision Engine süresi, Prompt Builder
      // süresi, Gemini süresi, Toplam AI Pipeline süresi" ayrı ayrı loglanmalı.
      logger.info("AI", "AI Pipeline süre dökümü", {
        parcelId,
        decisionEngineUsed: !!decisionEngineContext,
        decisionEngineDurationMs,
        promptBuilderDurationMs,
        geminiDurationMs,
        totalPipelineDurationMs: Date.now() - pipelineStartTime,
        // Sprint 5G — Görev: "hangi açıklama şablonu kullanıldı, açıklama uzunluğu, prompt uzunluğu" loglanmalı.
        explanationTemplateUsed: usedTemplateName,
        explanationLength: decisionEngineContext?.length ?? 0,
        promptLength: prompt.length,
      });

      return recommendation;
    } catch (error) {
      logger.error("AI", `Failed to generate recommendation for parcel ID: '${parcelId}'`, error);
      return null;
    }
  }
}

export const parcelRecommendationService = new ParcelRecommendationService();
