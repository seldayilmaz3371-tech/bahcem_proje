/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { vectorChunkRepository } from "../../repositories/ai.repository";
import { logger } from "../../logger";
import { config } from "../../config";
import { VectorChunk } from "../../models";
import { embeddingStorageService } from "../embedding-storage.service";
import { aiUsageTrackerService } from "../ai-usage-tracker.service";
import { getGeminiClient, callGeminiWithRetry } from "./gemini-client";

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
// Kept as module-scoped state within this file only: it has no
// independent persisted state and no consumers outside this module's
// `generateEmbedding` function. Moving it into a shared/exported location
// would risk a second, disconnected cache instance appearing elsewhere —
// this file is the single source of truth for embedding caching.
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
  const response = await callGeminiWithRetry(() => {
    aiUsageTrackerService.recordUsage(embeddingModel);
    return client.models.embedContent({
      model: embeddingModel,
      contents: text,
    });
  });

  // SDK'nın kendi tip tanımına göre (@google/genai, EmbedContentResponse):
  // `embeddings`, TEK bir nesne değil, her biri kendi `.values` alanına
  // sahip bir ContentEmbedding DİZİSİdir — toplu (batch) istekleri de
  // desteklemek için API'nin tek-metin isteklerinde bile 1 elemanlı bir
  // dizi döndürmesinden kaynaklanıyor. Önceki kod bu diziyi tek bir
  // nesne gibi okumaya çalışıyordu (`embeddings.values`), bu yüzden
  // hiçbir zaman değer bulamıyordu.
  const embeddingsArray = response.embeddings;
  let values: number[] | null = null;
  if (Array.isArray(embeddingsArray) && embeddingsArray.length > 0 && Array.isArray(embeddingsArray[0].values)) {
    values = embeddingsArray[0].values;
  }

  if (!values) {
    // Ham cevabı loglamak, SDK bir daha format değiştirirse teşhisi
    // saniyeler içinde mümkün kılar — geçen seferki gibi tahmin
    // yürütmeye gerek kalmaz.
    logger.error("RAG", "Embedding response'unda beklenen '.values' alanı bulunamadı.", undefined, { rawResponse: response });
    throw new Error("Gemini API'den vektör verisi alınamadı.");
  }

  cacheEmbedding(cacheKey, values);
  return values;
}

/**
 * Şu anki chunking algoritmasının sürüm numarası (bkz. VectorChunk.chunkVersion,
 * models.ts).
 *
 * - Versiyon 1 (Sprint 2A ve öncesi): karakter-bazlı `chunkText()` —
 *   yapıyı (başlık/paragraf) hiç bilmeden, sabit karakter sayısında kesme.
 * - Versiyon 2 (Sprint 2B, ŞİMDİ): `semanticChunkText()`
 *   (semantic-chunking.util.ts) — başlık/paragraf sınırlarını koruyan,
 *   format-bağımsız yapısal chunking. Gerçekten farklı bir algoritma
 *   olduğu için sürüm artırıldı — ileride bir "yeniden indeksle"
 *   özelliği, hâlâ sürüm 1 ile üretilmiş (daha düşük kaliteli) eski
 *   chunk'ları bu sayı üzerinden kesin olarak ayırt edebilecek.
 */
export const CURRENT_CHUNK_VERSION = 2;

/**
 * Bir chunk'ın tüm metadata alanlarını (yalnızca ham içeriği değil)
 * birlikte özetleyen SHA-256 karması (bkz. Sprint 2A madde 3). Yalnızca
 * content değişince değil, heading/cropType/keywords/topics/chunkVersion
 * gibi ÜRETİLEN metadata değişince de farklı bir özet üretir — ileride
 * bir "yeniden indeksle" işleminde, bu özeti karşılaştırarak GERÇEKTEN
 * hiçbir şeyi değişmemiş bir chunk'ı gereksiz yere tekrar Gemini'ye
 * göndermeyi (ve o API maliyetini) atlamak mümkün olacak.
 *
 * SHA-256 seçildi çünkü: (a) projede zaten kurulu bir standart —
 * doküman içerik özeti ve fotoğraf içerik özeti aynı algoritmayı
 * kullanıyor, yeni bir bağımlılık eklemiyor (Node'un yerleşik `crypto`
 * modülü yeterli), (b) bu ölçekteki küçük metin/metadata kayıtları için
 * performansı önemsizce hızlı, kriptografik güvenlik değil yalnızca
 * "değişti mi değişmedi mi" tespiti için kullanılıyor.
 */
export function computeChunkHash(fields: {
  content: string;
  heading?: string;
  cropType?: string;
  keywords?: string[];
  topics?: string[];
  chunkVersion?: number;
}): string {
  // Alanlar sabit bir sırayla birleştiriliyor — dizi/nesne sıralamasına
  // bağlı tutarsız özetler üretmemek için (örn. keywords dizisinin
  // eleman sırası değişse bile aynı küme aynı özeti vermeli).
  const canonical = JSON.stringify({
    content: fields.content,
    heading: fields.heading ?? null,
    cropType: fields.cropType ?? null,
    keywords: [...(fields.keywords ?? [])].sort(),
    topics: [...(fields.topics ?? [])].sort(),
    chunkVersion: fields.chunkVersion ?? null,
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
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
 * Performs a vector search over chunks to locate similar references.
 * @param query The user's query text
 * @param limit Maximum number of relevant chunks to retrieve
 * @param documentIds Optional scoping filter: when provided, only chunks
 *   belonging to one of these document IDs are searched (e.g. restricting
 *   a search to a single piece of equipment's uploaded manual instead of
 *   the entire shared knowledge base). When omitted, searches all chunks,
 *   exactly as before this parameter was introduced.
 */
/**
 * Sprint 2D — Aşama 3: Metadata-aware Ranking.
 *
 * Bir chunk'ın `heading`/`topics`/`keywords`/`cropType` alanlarında,
 * sorgudaki kelimelerin geçip geçmediğine göre küçük bir ek puan
 * hesaplar. Saf embedding benzerliğinin YERİNE değil, YANINDA kullanılır
 * — amaç, "Mutifa WG" gibi kısa ürün adlarının chunk metadata'sında
 * birebir geçtiği durumlarda, yalnızca embedding benzerliğinin
 * kaçırabileceği alaka düzeyini yakalamak.
 *
 * NOT: VectorChunk modelinde "category" adlı bir alan YOK (yalnızca
 * heading/topics/keywords/cropType var, bkz. models.ts) — var
 * olmayan bir alan varsayılmadı, gerçek alanlar kullanıldı.
 */
function computeMetadataBoost(chunk: VectorChunk, queryWords: string[]): number {
  const metadataText = [chunk.heading, chunk.cropType, ...(chunk.topics ?? []), ...(chunk.keywords ?? [])]
    .filter((v): v is string => Boolean(v))
    .join(" ")
    .toLocaleLowerCase("tr-TR");

  if (!metadataText) return 0;

  let matchCount = 0;
  for (const word of queryWords) {
    if (word.length >= 3 && metadataText.includes(word)) {
      matchCount++;
    }
  }
  // Her eşleşen kelime için küçük, sınırlı bir bonus — saf embedding
  // skorunu (0-1 aralığı) domine etmeyecek kadar küçük tutuldu.
  return Math.min(matchCount * 0.05, 0.15);
}

/**
 * @param metadataBoostQuery Sprint 2D — İSTEĞE BAĞLI. Verilirse,
 *   embedding benzerliğine ek olarak heading/topics/keywords/cropType
 *   eşleşmesine dayalı küçük bir puan eklenir (bkz. computeMetadataBoost).
 *   Verilmezse (varsayılan, mevcut tüm çağrı yerleri — örn.
 *   parcel-recommendation.service.ts — dahil), davranış Sprint 2C
 *   öncesiyle BİREBİR AYNI kalır; bu parametre geriye dönük tam uyumlu
 *   bir eklemedir.
 */
export async function searchSimilarChunks(
  query: string,
  limit = 4,
  documentIds?: string[],
  metadataBoostQuery?: string
): Promise<{ chunk: VectorChunk; score: number }[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const allChunks = await vectorChunkRepository.getAll();
    const candidateChunks = documentIds
      ? allChunks.filter((chunk) => documentIds.includes(chunk.documentId))
      : allChunks;

    const queryWords = metadataBoostQuery
      ? metadataBoostQuery.toLocaleLowerCase("tr-TR").split(/[^\p{L}0-9]+/u).filter((w) => w.length >= 3)
      : [];

    const matches = candidateChunks.map((chunk) => {
      // Embeddings are stored as individual files on disk (see
      // EmbeddingStorageService); a not-yet-migrated legacy chunk may
      // still carry its embedding inline in the record itself.
      const chunkEmbedding = embeddingStorageService.readEmbedding(chunk.id) ?? chunk.embeddings;
      const baseScore = cosineSimilarity(queryEmbedding, chunkEmbedding);
      const boost = metadataBoostQuery ? computeMetadataBoost(chunk, queryWords) : 0;
      return { chunk, score: baseScore + boost };
    });

    // Sort descending by similarity score
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit);
  } catch (error) {
    logger.error("RAG", "Error occurred during vector similarity search", error);
    return [];
  }
}

/**
 * Sprint 2D — Aşama 1: Document-aware Retrieval.
 *
 * `searchSimilarChunks()`'ın KENDİSİNE dokunulmadı (o fonksiyon
 * `parcel-recommendation.service.ts` tarafından da kullanılıyor —
 * değiştirmek Sprint 2D'nin kapsamı dışındaki bir akışı da etkilerdi).
 * Bunun yerine, bu YENİ, izole fonksiyon onun sonucunu ayrıca zenginleştiriyor.
 *
 * PROBLEM (Sprint 2C sonrası gerçek Mutifa WG testinde kanıtlandı): saf
 * global Top-K sıralaması, aynı dokümandan gelen ama sıralamada biraz
 * geride kalan (örn. #6, #13, #14) alakalı chunk'ları dışarıda
 * bırakabiliyor — özellikle bir dokümanın konusu birden fazla chunk'a
 * yayılmışsa (ürün adı bir chunk'ta, kullanım talimatı başka bir
 * chunk'ta).
 *
 * ÇÖZÜM: İlk Top-K sonuçlarındaki EN YÜKSEK skorlu chunk'ın ait olduğu
 * dokümandan, henüz sonuçlarda olmayan ama yine de makul ölçüde alakalı
 * (mutlak bir minimum benzerlik eşiğini geçen) EK chunk'lar aranır ve
 * sonuçlara eklenir. Sınırlı sayıda (maxExtra) ek chunk eklenir — token
 * kullanımının kontrolsüz büyümesini önlemek için.
 */
export async function expandWithDocumentContext(
  initialMatches: { chunk: VectorChunk; score: number }[],
  query: string,
  maxExtra = 2,
  minExtraScore = 0.5
): Promise<{ chunk: VectorChunk; score: number }[]> {
  if (initialMatches.length === 0) return initialMatches;

  const topDocumentId = initialMatches[0].chunk.documentId;
  const alreadyIncludedIds = new Set(initialMatches.map((m) => m.chunk.id));

  try {
    const queryEmbedding = await generateEmbedding(query);
    const allChunks = await vectorChunkRepository.getAll();
    const sameDocumentCandidates = allChunks.filter(
      (chunk) => chunk.documentId === topDocumentId && !alreadyIncludedIds.has(chunk.id)
    );

    const scoredCandidates = sameDocumentCandidates
      .map((chunk) => {
        const chunkEmbedding = embeddingStorageService.readEmbedding(chunk.id) ?? chunk.embeddings;
        const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
        return { chunk, score };
      })
      .filter((m) => m.score >= minExtraScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxExtra);

    if (scoredCandidates.length === 0) return initialMatches;

    return [...initialMatches, ...scoredCandidates];
  } catch (error) {
    logger.error("RAG", "Error occurred during document-aware context expansion", error);
    return initialMatches;
  }
}

/**
 * Sprint 2D — Aşama 2: Adjacent Chunk Retrieval.
 *
 * PROBLEM: Bir chunk (örn. "Mutifa WG" ürün adı listesi) ile onu hemen
 * takip eden veya önceleyen chunk (örn. aynı listenin devamı, ya da
 * kısa bir başlık + devamındaki ilk paragraf) arasında GERÇEK bir
 * bağlamsal ilişki olabilir, ama bu ilişki yalnızca `chunkIndex`
 * sırasıyla ifade edilir — embedding benzerliğiyle YAKALANMAYABİLİR
 * (iki komşu chunk, konu olarak ilişkili olsa bile birbirinden çok
 * farklı embed edilebilir).
 *
 * ÇÖZÜM: Seçilen her chunk için, YALNIZCA hemen bitişik (chunkIndex ± 1)
 * komşularını, zaten sonuçlarda değillerse ekler. "Gereksiz token artışı
 * oluşturma" kısıtına uyarak: yalnızca komşu chunk GERÇEKTEN küçükse
 * (maxAdjacentLength karakterden az — büyük bir komşu chunk'ı eklemek
 * orantısız token maliyeti yaratır) ekleniyor, ve zaten sonuçlarda olan
 * bir chunk asla tekrar eklenmiyor.
 */
export async function expandWithAdjacentChunks(
  matches: { chunk: VectorChunk; score: number }[],
  maxAdjacentLength = 400
): Promise<{ chunk: VectorChunk; score: number }[]> {
  if (matches.length === 0) return matches;

  const alreadyIncludedIds = new Set(matches.map((m) => m.chunk.id));
  const allChunks = await vectorChunkRepository.getAll();
  const additions: { chunk: VectorChunk; score: number }[] = [];

  for (const { chunk, score } of matches) {
    const neighborIndexes = [chunk.chunkIndex - 1, chunk.chunkIndex + 1];
    for (const neighborIndex of neighborIndexes) {
      const neighbor = allChunks.find(
        (c) => c.documentId === chunk.documentId && c.chunkIndex === neighborIndex
      );
      if (!neighbor || alreadyIncludedIds.has(neighbor.id)) continue;
      if (neighbor.content.length > maxAdjacentLength) continue; // gereksiz token artışını önle

      alreadyIncludedIds.add(neighbor.id);
      // Komşu chunk'ın kendi bağımsız bir benzerlik skoru yok — onu
      // seçme nedeni "komşuluk", bu yüzden şeffaflık için skor 0 olarak
      // işaretleniyor (ayırt edilebilir olsun diye, yanıltıcı bir skor
      // uydurulmuyor).
      additions.push({ chunk: neighbor, score: 0 });
    }
  }

  return [...matches, ...additions];
}
