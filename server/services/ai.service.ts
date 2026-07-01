/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { 
  uploadedDocumentRepository, 
  vectorChunkRepository, 
  aiRecommendationRepository 
} from "../repositories/ai.repository";
import { parcelRepository } from "../repositories/parcel.repository";
import { observationRepository } from "../repositories/observation.repository";
import { inventoryItemRepository } from "../repositories/inventory.repository";
import { db } from "../database";
import { logger } from "../logger";
import { UploadedDocument, VectorChunk, AIRecommendation, WeatherRecord } from "../models";
import { AgriUtils } from "../utils";

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

/**
 * Generates numerical vector embeddings for a given block of text.
 * Uses gemini-embedding-2-preview.
 * @param text The input text string to represent as vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient();
  const response = await client.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: text,
  });

  const embeddings = response.embeddings || (response as any).embedding;
  if (embeddings && Array.isArray(embeddings.values)) {
    return embeddings.values;
  }
  if (response && Array.isArray((response as any).values)) {
    return (response as any).values;
  }
  throw new Error("Gemini API'den vektör verisi alınamadı.");
}

/**
 * Splits document text into clean, contextual overlapping chunks.
 * Ensures transitions between blocks do not lose vital agricultural context.
 */
export function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const chunks: string[] = [];
  let index = 0;
  
  while (index < text.length) {
    const chunk = text.substring(index, index + chunkSize).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    index += chunkSize - overlap;
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
      const score = cosineSimilarity(queryEmbedding, chunk.embeddings);
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
      
      // Step 3: Embed each chunk and save to vector chunk repository
      for (let i = 0; i < textChunks.length; i++) {
        const chunkTextContent = textChunks[i];
        let embeddings: number[] = [];
        try {
          embeddings = await generateEmbedding(chunkTextContent);
        } catch (e) {
          logger.error("RAG", `Embedding failed for chunk index ${i}. Using blank fallback embeddings.`, e);
          embeddings = new Array(768).fill(0); // Blank embedding fallback to avoid hard crashes
        }

        await vectorChunkRepository.create({
          documentId: newDoc.id,
          chunkIndex: i,
          content: chunkTextContent,
          embeddings,
        });
      }

      // Step 4: Generate a summary of the document using Gemini
      try {
        const client = getGeminiClient();
        const summaryResponse = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Aşağıdaki tarımsal dokümanı 2 cümle ile özetle. Çiftçinin ne konuda bilgi edinebileceğini belirt:\n\n${textContent.substring(0, 3000)}`,
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

      // Delete vector chunks
      await vectorChunkRepository.deleteByDocumentId(documentId);
      // Delete document record
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
   * for a specific plot, integrating sensor data, weather data, inventory stocks, and RAG articles.
   */
  public async generateParcelRecommendation(
    parcelId: string,
    userQuery?: string
  ): Promise<AIRecommendation | null> {
    try {
      // 1. Retrieve plot details
      const parcel = await parcelRepository.getById(parcelId);
      if (!parcel) {
        throw new Error("Ulaşılmaya çalışılan tarsel (parsel) kaydı bulunamadı.");
      }

      // 2. Fetch linked observation records (up to 5 recent)
      const allObservations = await observationRepository.getAll();
      const parcelObservations = allObservations
        .filter((o) => o.parcelId === parcelId)
        .sort((a, b) => new Date(b.observationDate).getTime() - new Date(a.observationDate).getTime())
        .slice(0, 5);

      const observationsContext = parcelObservations.length > 0
        ? parcelObservations.map((o, idx) => `[Gözlem ${idx + 1} - Tarih: ${o.observationDate}]: ${o.notes}`).join("\n")
        : "Bu parsel için yakın zamanda kaydedilmiş gözlem raporu bulunmuyor.";

      // 3. Fetch weather history records
      const rawDb = await db.readRaw();
      const weatherHistory = rawDb.weatherHistory || [];
      const recentWeather = weatherHistory
        .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime())
        .slice(0, 5);

      const weatherContext = recentWeather.length > 0
        ? recentWeather.map((w) => `[Tarih: ${w.recordDate}]: En Yüksek Sıcaklık: ${w.tempMax}°C, En Düşük Sıcaklık: ${w.tempMin}°C, Nem: %${w.humidity}, Don Riski Var Mı: ${w.hasFrostRisk ? "EVET" : "HAYIR"}`).join("\n")
        : "Yakın zamana ait meteorolojik veri bulunmamaktadır.";

      // 4. Fetch under-stocked inventory alerts
      const allInventory = await inventoryItemRepository.getAll();
      const stockAlerts = allInventory.filter((item) => item.stockQuantity <= item.minStockAlert);
      const inventoryContext = stockAlerts.length > 0
        ? stockAlerts.map((i) => `- ${i.name} (Stokta: ${i.stockQuantity} ${i.unit}, Kritik Seviye: ${i.minStockAlert} ${i.unit})`).join("\n")
        : "Tüm gübre ve ilaç stok seviyeleri güvenli eşiğin üzerindedir.";

      // 5. Query RAG context using similarity vectors
      const querySearchTerm = userQuery || `Mersin Toroslar Değirmençay zeytin yetiştiriciliği sulama gübreleme hastalık koruma`;
      const similarChunks = await searchSimilarChunks(querySearchTerm, 3);
      const ragContext = similarChunks.length > 0
        ? similarChunks.map((m, idx) => `[RAG Kaynak ${idx + 1} - Güven Skoru: ${(m.score * 100).toFixed(1)}%]: ${m.chunk.content}`).join("\n")
        : "Bilgi deposunda zeytin tarımıyla ilgili eşleşen makale bulunamadı.";

      // 6. Build highly customized expert prompt
      const prompt = `
Sen Mersin Toroslar ve Değirmençay bölgesinde uzmanlaşmış yapay zeka destekli bir Tarım Danışmanısın (Mersin Tarım Asistanı).
Aşağıdaki verilere dayanarak çiftçiye özel, bilimsel, pratik ve bölgesel (Toroslar mikro-klimasına uygun) tavsiyeler üreteceksin.

=== ÇİFTLİK VE PARSEL BİLGİLERİ ===
Parsel Adı: ${parcel.name}
Alan: ${parcel.areaDekar} Dekar
Ağaç Sayısı: ${parcel.treeCount} adet zeytin ağacı
Toprak Yapısı: ${parcel.soilType}
Sulama Yöntemi: ${parcel.irrigationType}

=== SON GÖZLEMLER VE SAHA RAPORLARI ===
${observationsContext}

=== GÜNCEL METEOROLOJİ VE DON RİSKİ ===
${weatherContext}

=== ENVANTER VE STOK DURUMU (Kritik Stok Uyarısı Olan Ürünler) ===
${inventoryContext}

=== BİLGİ DEPOSU VE RAG KAYNAKLARINDAN ALINAN BİLGİLER ===
${ragContext}

=== KULLANICI SORUSU ===
"${userQuery || "Bu parsel için genel durum analizi ve gelecek haftaki tarımsal faaliyet planı nedir?"}"

Senden istenenler:
1. **Analiz ve Teşhis**: Gözlemlerde belirtilen hastalık, zararlı (örn. Zeytin sineği, halkalı leke, dökülme) veya besin eksikliklerini değerlendir.
2. **Eylem Planı**: Sulama, gübreleme, ilaçlama veya budama için somut tavsiyeler ver. Eğer don riski varsa, Toroslar/Değirmençay bölgesinde don önleme için yapılacakları vurgula.
3. **Uygulama Dozajı**: Envanterde bulunan ilaç ve gübrelerin, parsel büyüklüğüne ve ağaç sayısına göre doğru dozajlarını hesapla.
4. **Hasat Öngörüsü**: Eğer hasat dönemi yaklaşıyorsa, son ilaçlama ile hasat arasındaki bekleme sürelerine (PH) dikkat çek.

Cevabını Markdown formatında, net başlıklar, maddeler ve profesyonel/samimi bir Türkçe tonuyla yaz.
`;

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      if (!response.text) {
        throw new Error("Yapay zeka asistanından boş bir cevap döndü.");
      }

      // 7. Calculate confidence score
      let score = 0.85; // Default score
      if (similarChunks.length > 0) {
        score = Math.max(score, similarChunks[0].score);
      }

      // 8. Create recommendation record in DB
      const timestamp = new Date().toISOString();
      const recommendation = await aiRecommendationRepository.create({
        parcelId,
        recommendationType: "Genel",
        content: response.text.trim(),
        confidenceScore: parseFloat(score.toFixed(2)),
        usedDocumentsCount: similarChunks.length,
        usedObservationsCount: parcelObservations.length,
        usedWeatherCount: recentWeather.length,
        usedInventoryCount: allInventory.length,
        createdDate: timestamp,
      });

      logger.info("AI", `Generated customized expert advisory report for parcel: '${parcel.name}'`);
      return recommendation;
    } catch (error) {
      logger.error("AI", `Failed to generate recommendation for parcel ID: '${parcelId}'`, error);
      return null;
    }
  }

  /**
   * Generates a generic agriculture-related prompt query answer (Chat mode) using loaded RAG documentation.
   */
  public async queryChatAssistant(userQuery: string): Promise<{ text: string; usedChunks: string[] }> {
    try {
      // Find matching chunks
      const matches = await searchSimilarChunks(userQuery, 3);
      const ragContext = matches.length > 0
        ? matches.map((m, idx) => `[Referans ${idx + 1}]: ${m.chunk.content}`).join("\n\n")
        : "Eşleşen spesifik bir döküman bulunamadı.";

      const prompt = `
Sen Mersin Toroslar ve Değirmençay bölgesinde uzmanlaşmış tarım asistanı "Mersin Tarım Asistanı" yapay zeka danışmanısın.
Aşağıdaki bilgi deposundan alınan kaynakları temel alarak kullanıcının zeytin tarımı, bahçe bakımı, gübreleme veya hastalık koruma ile ilgili sorusuna yanıt vereceksin.

=== BİLGİ DEPOSU REFERANSLARI ===
${ragContext}

=== KULLANICI SORUSU ===
"${userQuery}"

Lütfen soruyu tamamen doğru, bilimsel ve pratik bir yaklaşımla, zeytin ağaçlarının sağlığını korumaya yönelik, Türkçe tonunda yanıtla. Yanıtında referanslardan faydalandığını hissettir. Markdown formatını kullan.
`;

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      return {
        text: response.text ? response.text.trim() : "Yapay zeka asistanından bir yanıt alınamadı.",
        usedChunks: matches.map(m => m.chunk.content)
      };
    } catch (error) {
      logger.error("AI", "Error inside general chat assistant query", error);
      throw error;
    }
  }
}

export const aiService = new AIService();
