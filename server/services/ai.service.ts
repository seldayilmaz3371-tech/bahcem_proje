/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import {
  uploadedDocumentRepository,
  vectorChunkRepository,
  aiRecommendationRepository
} from "../repositories/ai.repository";
import { parcelRepository } from "../repositories/parcel.repository";
import { observationRepository, photoRepository } from "../repositories/observation.repository";
import { inventoryItemRepository } from "../repositories/inventory.repository";
import { db } from "../database";
import { logger } from "../logger";
import { config } from "../config";
import { UploadedDocument, VectorChunk, AIRecommendation, Photo, PhotoAiAnalysis } from "../models";
import { weatherService } from "./weather.service";
import { photoStorageService } from "./photo-storage.service";
import { embeddingStorageService } from "./embedding-storage.service";
import { aiUsageTrackerService } from "./ai-usage-tracker.service";
import { isUncertainAnalysis } from "./growth-scoring.util";
import { capUserQueryLength } from "../prompts/prompt-safety.util";
import { buildDocumentSummaryPrompt } from "../prompts/document-summary.prompt";
import { buildParcelRecommendationPrompt } from "../prompts/parcel-recommendation.prompt";
import { buildChatAssistantPrompt } from "../prompts/chat-assistant.prompt";
import { buildGrowthAnalysisPrompt } from "../prompts/growth-analysis.prompt";
import { buildPhotoAnalysisPrompt } from "../prompts/photo-analysis.prompt";

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

// ==========================================================================
// EMBEDDING CACHE
//
// Identical (or near-identical, after trimming/case-normalization) text
// embedded more than once within the cache's lifetime is served from
// memory instead of re-calling the Gemini embedding API. This directly
// reduces daily quota consumption for repeated farmer questions (e.g.
// multiple people asking a similarly worded question) without touching
// answer quality, since the returned vector is byte-for-byte the same
// value Gemini would have produced for the same input text.
//
// Deliberately implemented here (not as a separate file/service): it has
// no independent persisted state, no external consumers beyond
// `generateEmbedding` in this module, and is a handful of lines — moving
// it out would be an unnecessary abstraction for no real benefit.
// ==========================================================================

/** Maximum number of distinct query embeddings kept in memory at once. */
const MAX_EMBEDDING_CACHE_ENTRIES = 500;

const embeddingCache = new Map<string, number[]>();

/**
 * Normalizes text into a cache key: trimmed and lower-cased so trivial
 * formatting differences (extra whitespace, capitalization) still hit
 * the same cache entry, then hashed to keep map keys a fixed, small size.
 */
function buildEmbeddingCacheKey(text: string): string {
  const normalized = text.trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Inserts an entry into the embedding cache, evicting the oldest entry
 * first if the cache is at capacity (simple FIFO bound, sufficient for
 * this application's scale — a full LRU is unnecessary complexity here).
 */
function cacheEmbedding(cacheKey: string, embedding: number[]): void {
  if (embeddingCache.size >= MAX_EMBEDDING_CACHE_ENTRIES) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey !== undefined) {
      embeddingCache.delete(oldestKey);
    }
  }
  embeddingCache.set(cacheKey, embedding);
}

/**
 * Generates numerical vector embeddings for a given block of text.
 * Uses the configured embedding model (see config.ai.embeddingModel).
 * Serves a cached result when the exact same text was embedded before,
 * avoiding a redundant Gemini API call and its quota cost.
 * @param text The input text string to represent as vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cacheKey = buildEmbeddingCacheKey(text);
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = getGeminiClient();
  const embeddingModel = config.ai.embeddingModel;
  aiUsageTrackerService.recordUsage(embeddingModel);
  const response = await client.models.embedContent({
    model: embeddingModel,
    contents: text,
  });

  const embeddings = response.embeddings || (response as any).embedding;
  let values: number[] | null = null;
  if (embeddings && Array.isArray(embeddings.values)) {
    values = embeddings.values;
  } else if (response && Array.isArray((response as any).values)) {
    values = (response as any).values;
  }

  if (!values) {
    throw new Error("Gemini API'den vektör verisi alınamadı.");
  }

  cacheEmbedding(cacheKey, values);
  return values;
}

/**
 * Splits document text into clean, contextual overlapping chunks.
 * Ensures transitions between blocks do not lose vital agricultural context.
 */
export function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const chunks: string[] = [];
  let index = 0;
  const step = chunkSize - overlap;
  if (step <= 0) {
    return [text];
  }

  while (index < text.length) {
    const chunk = text.substring(index, index + chunkSize).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    index += step;
    if (index >= text.length - overlap) {
      break;
    }
  }
  return chunks;
}

/**
 * Computes the Cosine Similarity between two numerical vectors of identical dimension.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Performs a vector search over all chunks to locate similar references.
 * @param query The user's query text
 * @param limit Maximum number of relevant chunks to retrieve
 */
export async function searchSimilarChunks(query: string, limit = 4): Promise<{ chunk: VectorChunk; score: number }[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const allChunks = await vectorChunkRepository.getAll();

    const matches = allChunks.map((chunk) => {
      // Embeddings are stored as individual files on disk (see
      // EmbeddingStorageService); a not-yet-migrated legacy chunk may
      // still carry its embedding inline in the record itself.
      const chunkEmbedding = embeddingStorageService.readEmbedding(chunk.id) ?? chunk.embeddings;
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
      return { chunk, score };
    });

    // Sort descending by similarity score
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit);
  } catch (error) {
    logger.error("RAG", "Error occurred during vector similarity search", error);
    return [];
  }
}

// ==========================================================================
// CHAT GREETING SHORT-CIRCUIT
//
// A short, purely conversational message ("merhaba", "teşekkürler") has
// no agricultural content to search against and gains nothing from an
// embedding + Gemini round trip. Recognizing these and answering them
// locally avoids spending API quota on messages that were never really
// questions in the first place. This does NOT touch real questions —
// anything not matching this narrow, conservative pattern still goes
// through the full RAG + Gemini pipeline unchanged.
// ==========================================================================

const GREETING_PATTERNS = ["merhaba", "selam", "günaydın", "iyi günler", "teşekkür", "sağol", "sağ ol"];

/** Messages at or below this length are eligible for the greeting short-circuit. */
const MAX_GREETING_MESSAGE_LENGTH = 30;

/**
 * Detects whether a chat message is a trivial greeting/thanks with no
 * agricultural question content, based on a short, conservative keyword
 * list. Intentionally narrow: a false negative (treating a greeting as a
 * real question) only costs one extra API call, while a false positive
 * (treating a real question as a greeting) would silently withhold a
 * real answer — so this only matches very short messages.
 */
function isTrivialGreeting(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > MAX_GREETING_MESSAGE_LENGTH) {
    return false;
  }
  return GREETING_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * AI Decision Support Service for farming advice, diagnoses, and parameter optimizations.
 */
export class AIService {
  /**
   * Registers a document, generates overlapping text chunks, vectorizes them,
   * and populates the local vector database.
   */
  public async processDocument(
    uploadedBy: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    textContent: string
  ): Promise<UploadedDocument | null> {
    try {
      // Step 1: Create uploaded document entry
      const timestamp = new Date().toISOString();
      const newDoc = await uploadedDocumentRepository.create({
        fileName,
        fileType,
        fileSize,
        uploadedBy,
        uploadDate: timestamp,
      });

      // Step 2: Split text into overlapping segments
      const textChunks = chunkText(textContent);

      // Step 3: Embed each chunk, persist the (large) embedding vector to
      // its own file on disk, and save only a lightweight record (id,
      // content, chunk index) in the main database.
      for (let i = 0; i < textChunks.length; i++) {
        const chunkTextContent = textChunks[i];
        let embeddings: number[] = [];
        try {
          embeddings = await generateEmbedding(chunkTextContent);
        } catch (e) {
          logger.error("RAG", `Embedding failed for chunk index ${i}. Using blank fallback embeddings.`, e);
          embeddings = new Array(768).fill(0); // Blank embedding fallback to avoid hard crashes
        }

        const chunkId = crypto.randomUUID();
        embeddingStorageService.saveEmbedding(embeddings, chunkId);

        await vectorChunkRepository.create({
          id: chunkId,
          documentId: newDoc.id,
          chunkIndex: i,
          content: chunkTextContent,
          embeddings: [],
        });
      }

      // Step 4: Generate a summary of the document using Gemini
      try {
        const client = getGeminiClient();
        aiUsageTrackerService.recordUsage(config.ai.generationModel);
        const summaryResponse = await client.models.generateContent({
          model: config.ai.generationModel,
          contents: buildDocumentSummaryPrompt(textContent),
        });
        if (summaryResponse.text) {
          await uploadedDocumentRepository.update(newDoc.id, {
            summary: summaryResponse.text.trim(),
          });
          newDoc.summary = summaryResponse.text.trim();
        }
      } catch (sumErr) {
        logger.error("RAG", "Could not generate automated summary for document.", sumErr);
      }

      logger.info("RAG", `Successfully processed and indexed document: '${fileName}' into ${textChunks.length} chunks.`);
      return newDoc;
    } catch (error) {
      logger.error("RAG", "Fatal error processing uploaded document.", error);
      return null;
    }
  }

  /**
   * Unlinks a document and cleans up its vector chunks database.
   */
  public async removeDocument(documentId: string): Promise<boolean> {
    try {
      const docExists = await uploadedDocumentRepository.getById(documentId);
      if (!docExists) return false;

      // Delete each chunk's on-disk embedding file before removing the
      // lightweight chunk records themselves.
      const chunksToDelete = await vectorChunkRepository.getByDocumentId(documentId);
      for (const chunk of chunksToDelete) {
        embeddingStorageService.deleteEmbedding(chunk.id);
      }

      await vectorChunkRepository.deleteByDocumentId(documentId);
      await uploadedDocumentRepository.delete(documentId);

      logger.info("RAG", `Document and its vector index unlinked: ID: '${documentId}'`);
      return true;
    } catch (error) {
      logger.error("RAG", "Failed to delete document from registry.", error);
      return false;
    }
  }

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

      aiUsageTrackerService.recordUsage(config.ai.generationModel);
      if (hasPhotos) {
        const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [
          { text: prompt },
        ];
        for (const file of photoFiles!) {
          parts.push({ inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimeType } });
        }
        const response = await client.models.generateContent({
          model: config.ai.generationModel,
          contents: parts,
        });
        responseText = response.text;
      } else {
        const response = await client.models.generateContent({
          model: config.ai.generationModel,
          contents: prompt,
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

  /**
   * Generates a generic agriculture-related prompt query answer (Chat mode) using loaded RAG documentation.
   * Trivial greetings/thanks are answered locally without calling Gemini
   * at all (see `isTrivialGreeting`), since they carry no agricultural
   * question content to ground an AI response in.
   */
  public async queryChatAssistant(userQuery: string): Promise<{ text: string; usedChunks: string[] }> {
    const safeQuery = capUserQueryLength(userQuery);

    if (isTrivialGreeting(safeQuery)) {
      return {
        text: "Merhaba! Ben Mersin AgriTech RAG asistanınızım. Zeytin tarımı, hastalık teşhisi veya yüklediğiniz dokümanlarla ilgili bir soru sorabilirsiniz.",
        usedChunks: [],
      };
    }

    try {
      const matches = await searchSimilarChunks(safeQuery, 3);
      const ragContext = matches.length > 0
        ? matches.map((m, idx) => `[Referans ${idx + 1}]: ${m.chunk.content}`).join("\n\n")
        : "Eşleşen spesifik bir döküman bulunamadı.";

      const prompt = buildChatAssistantPrompt(ragContext, safeQuery);

      const client = getGeminiClient();
      aiUsageTrackerService.recordUsage(config.ai.generationModel);
      const response = await client.models.generateContent({
        model: config.ai.generationModel,
        contents: prompt,
      });

      return {
        text: response.text ? response.text.trim() : "Yapay zeka asistanından bir yanıt alınamadı.",
        usedChunks: matches.map((m) => m.chunk.content),
      };
    } catch (error) {
      logger.error("AI", "Error inside general chat assistant query", error);
      throw error;
    }
  }

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
      aiUsageTrackerService.recordUsage(config.ai.generationModel);
      const response = await client.models.generateContent({
        model: config.ai.generationModel,
        contents: [
          { text: buildPhotoAnalysisPrompt(cropType) },
          { inlineData: { data: inlineData.base64Data, mimeType: inlineData.mimeType } },
        ],
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error("Gemini boş bir yanıt döndürdü.");
      }

      // Gemini is instructed to return raw JSON, but defensively strip
      // markdown code fences in case they are included anyway.
      const cleanedText = rawText.replace(/^```json\s*|```\s*$/g, "").trim();
      const parsed = JSON.parse(cleanedText) as {
        growthStage?: string;
        healthScore?: number | null;
        diseaseIndication?: string | null;
        confidence?: number;
      };

      const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
      const analysis: PhotoAiAnalysis = {
        growthStage: (parsed.growthStage as PhotoAiAnalysis["growthStage"]) || "Belirsiz",
        healthScore: typeof parsed.healthScore === "number" ? Math.max(0, Math.min(100, parsed.healthScore)) : null,
        diseaseIndication: parsed.diseaseIndication || null,
        confidence,
        isUncertain: isUncertainAnalysis(confidence),
        analyzedAt: new Date().toISOString(),
      };

      await photoRepository.update(photo.id, { aiAnalysis: analysis });
      return analysis;
    } catch (error) {
      logger.error("AI", `Fotoğraf analizi başarısız oldu, belirsiz analiz döndürülüyor. Photo ID: ${photo.id}`, error);
      return fallbackAnalysis;
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

      const MAX_PHOTOS = 12;
      const sampledPhotos = this.sampleEvenly(photosInRange, MAX_PHOTOS);

      // Ensure every sampled photo has a structured analysis. Photos
      // already analyzed (in this or any previous request) cost nothing
      // here; only genuinely new photos result in a Gemini vision call.
      const photoAnalyses = new Map<string, PhotoAiAnalysis>();
      for (const photo of sampledPhotos) {
        const analysis = await this.analyzePhotoOnce(photo, parcel.cropType);
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
      aiUsageTrackerService.recordUsage(config.ai.generationModel);
      const response = await client.models.generateContent({
        model: config.ai.generationModel,
        contents: prompt,
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

export const aiService = new AIService();
