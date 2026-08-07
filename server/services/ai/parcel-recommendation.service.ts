/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { aiRecommendationRepository, uploadedDocumentRepository } from "../../repositories/ai.repository";
import { groupMatchesByDocument } from "./rag-retrieval.service";
import { evaluateDocumentCoverage } from "./evidence-evaluation.util";
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
    requestedByUserId?: string,
    evidenceMode?: "STRICT_RAG" | "HYBRID"
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
        // Sprint 9.9 — TEST 1 kök neden düzeltmesi (kod kanıtıyla
        // doğrulandı): Bu mekanizma Sprint 2D'den beri VARDI ama
        // yalnızca Genel Sohbet'te (chat-assistant.service.ts)
        // aktifti — Karar Destek hiç kullanmıyordu. Aktif edilmesi,
        // kullanıcının KENDİ sorgu metnindeki terimlerin (örn. ürün
        // adı "10.5.40+ME") RAG boost hesabına katkı sağlamasını
        // sağlar — chunk.heading/cropType alanında bu terimler
        // geçen, ürüne özel chunk'ların Genel Havuzda öne çıkmasına
        // yardımcı olur. Genel Sohbet akışı ZATEN bunu kullanıyordu,
        // bu değişiklik onu ETKİLEMEZ.
        useMetadataBoost: true,
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

      // Sprint 9.8 — TEST 2 kök neden düzeltmesi (kod kanıtıyla doğrulandı):
      // AYNI sorun chat-assistant.service.ts'te de vardı (bkz. o dosyadaki
      // aynı-tarihli düzeltme) — prompt'a giden "[RAG Kaynak N]" etiketi
      // GERÇEK dosya adını hiç içermiyordu, model belge isimlerini asla
      // görmüyordu. `context.ragMatches`'in SIRASI/SKORLAMASI (bu
      // fonksiyonun başka yerlerinde ragMatches[0].score'a dayanan kodlar
      // var) DEĞİŞTİRİLMEDİ — yalnızca fileName çözünürlüğü eklendi.
      const documentNameById = new Map<string, string>();
      for (const m of context.ragMatches) {
        if (!documentNameById.has(m.chunk.documentId)) {
          const doc = await uploadedDocumentRepository.getById(m.chunk.documentId);
          documentNameById.set(m.chunk.documentId, doc?.fileName ?? "(bilinmeyen doküman)");
        }
      }

      const ragContext = context.ragMatches.length > 0
        ? context.ragMatches.map((m, idx) => `[RAG Kaynak ${idx + 1} - Belge: ${documentNameById.get(m.chunk.documentId) ?? "(bilinmeyen doküman)"} - Güven Skoru: ${(m.score * 100).toFixed(1)}%]: ${m.chunk.content}`).join("\n")
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
      // Sprint 9.11 — Evidence Architecture v2: Gemini'ye SORULMADAN,
      // BELGE BAZLI (tek chunk değil) olarak, mevcut ragMatches
      // skorlarından deterministik hesaplanıyor. `documentNameById`
      // (yukarıda, Sprint 9.8'de zaten oluşturulan map) YENİDEN
      // KULLANILIYOR — tekrar repository çağrısı yapılmıyor.
      const coverageResult = evaluateDocumentCoverage(context.ragMatches);
      const perDocumentCoverageText = coverageResult.perDocument
        .map((d) => {
          const label = d.coverage === "full" ? "YÜKSEK" : d.coverage === "partial" ? "ORTA" : "DÜŞÜK";
          return `- ${documentNameById.get(d.documentId) ?? "(bilinmeyen doküman)"}: skor ${d.topScore.toFixed(2)}, kapsam ${label}`;
        })
        .join("\n");
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
        documentCoverage: coverageResult.overall,
        perDocumentCoverageText,
        evidenceMode,
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
      logger.info("AI", `[Gemini Response — Karar Destek] ${responseText.slice(0, 300)}`);

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

      // Sprint 9.1 — SORUN 2/3: RAG'den gelen bilginin kaynağını
      // (hangi belge, hangi skor) yapılandırılmış olarak üretiyoruz —
      // PAYLAŞILAN groupMatchesByDocument() (rag-retrieval.service.ts)
      // kullanılıyor, product-document-qa.service.ts ile AYNI mantık.
      const orderedGroups = groupMatchesByDocument(context.ragMatches);
      const sources: NonNullable<AIRecommendation["sources"]> = [];
      for (const group of orderedGroups) {
        const doc = await uploadedDocumentRepository.getById(group[0].chunk.documentId);
        const headings = Array.from(new Set(group.map((m) => m.chunk.heading).filter((h): h is string => Boolean(h))));
        sources.push({
          documentId: group[0].chunk.documentId,
          fileName: doc?.fileName ?? "(bilinmeyen belge)",
          headings,
          score: Math.max(...group.map((m) => m.score)),
        });
      }
      logger.info("AI", `[Response Sources — Karar Destek] ${JSON.stringify(sources)}`);

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
        sources,
        documentCoverage: coverageResult.overall,
        evidenceMode: evidenceMode ?? "HYBRID",
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
