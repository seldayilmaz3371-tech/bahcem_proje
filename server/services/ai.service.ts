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
import { observationRepository, photoRepository } from "../repositories/observation.repository";
import { inventoryItemRepository } from "../repositories/inventory.repository";
import { db } from "../database";
import { logger } from "../logger";
import { UploadedDocument, VectorChunk, AIRecommendation, WeatherRecord, Photo } from "../models";
import { AgriUtils } from "../utils";
import { weatherService } from "./weather.service";

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
   * for a specific plot, integrating sensor data, live weather data, inventory stocks, and RAG articles.
   *
   * Weather grounding: this method combines two explicitly labeled sources —
   * (1) locally logged historical weather records ("Yerel Proje Verisi"), and
   * (2) a live, real-time forecast fetched from the Open-Meteo external API
   * ("Harici Web Verisi"). If the live API is unavailable, the prompt states
   * this explicitly rather than silently omitting it or fabricating values,
   * and the model is instructed to disclose which source(s) it relied on.
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

      // 3. Fetch locally logged historical weather records (Yerel Proje Verisi)
      const rawDb = await db.readRaw();
      const weatherHistory = rawDb.weatherHistory || [];
      const recentWeather = weatherHistory
        .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime())
        .slice(0, 5);

      const localWeatherContext = recentWeather.length > 0
        ? recentWeather.map((w) => `[Tarih: ${w.recordDate}]: En Yüksek Sıcaklık: ${w.tempMax}°C, En Düşük Sıcaklık: ${w.tempMin}°C, Nem: %${w.humidity}, Don Riski Var Mı: ${w.hasFrostRisk ? "EVET" : "HAYIR"}`).join("\n")
        : "Yerel veritabanında manuel olarak kaydedilmiş yakın zamana ait meteorolojik veri bulunmamaktadır.";

      // 3b. Fetch live, real-time forecast from the Open-Meteo external API
      // (Harici Web Verisi). Never fails the entire recommendation if the
      // external API is down — degrades gracefully with an explicit notice.
      const liveWeather = await weatherService.getWeatherSummaryForAI();

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

=== ÇİFTLİK VE PARSEL BİLGİLERİ (KAYNAK: Yerel Proje Verisi) ===
Parsel Adı: ${parcel.name}
Alan: ${parcel.areaDekar} Dekar
Ağaç Sayısı: ${parcel.treeCount} adet zeytin ağacı
Toprak Yapısı: ${parcel.soilType}
Sulama Yöntemi: ${parcel.irrigationType}

=== SON GÖZLEMLER VE SAHA RAPORLARI (KAYNAK: Yerel Proje Verisi) ===
${observationsContext}

=== METEOROLOJİ KAYNAK 1: GEÇMİŞ KAYITLAR (KAYNAK: Yerel Proje Verisi - Manuel Girilen Geçmiş Ölçümler) ===
${localWeatherContext}

=== METEOROLOJİ KAYNAK 2: CANLI GÜNCEL TAHMİN (KAYNAK: Harici Web Verisi - Open-Meteo API) ===
${liveWeather.text}

=== ENVANTER VE STOK DURUMU (KAYNAK: Yerel Proje Verisi) ===
${inventoryContext}

=== BİLGİ DEPOSU VE RAG KAYNAKLARINDAN ALINAN BİLGİLER (KAYNAK: RAG - Yüklenen Dokümanlar) ===
${ragContext}

=== KULLANICI SORUSU ===
"${userQuery || "Bu parsel için genel durum analizi ve gelecek haftaki tarımsal faaliyet planı nedir?"}"

Senden istenenler:
1. **Analiz ve Teşhis**: Gözlemlerde belirtilen hastalık, zararlı (örn. Zeytin sineği, halkalı leke, dökülme) veya besin eksikliklerini değerlendir.
2. **Eylem Planı**: Sulama, gübreleme, ilaçlama veya budama için somut tavsiyeler ver. Don riski değerlendirmeni MUTLAKA "METEOROLOJİ KAYNAK 2" bölümündeki canlı tahmine dayandır (eğer o bölüm veri alınamadığını belirtiyorsa, bunu açıkça söyle ve sadece geçmiş kayıtlara dayandığını belirt). Don riski varsa, Toroslar/Değirmençay bölgesinde don önleme için yapılacakları vurgula.
3. **Uygulama Dozajı**: Envanterde bulunan ilaç ve gübrelerin, parsel büyüklüğüne ve ağaç sayısına göre doğru dozajlarını hesapla.
4. **Hasat Öngörüsü**: Eğer hasat dönemi yaklaşıyorsa, son ilaçlama ile hasat arasındaki bekleme sürelerine (PH) dikkat çek.
5. **Kaynak Beyanı**: Yanıtının sonunda kısa bir "Kullanılan Kaynaklar" notu ekle; hangi bölümler için Yerel Proje Verisi, hangi bölümler için Harici Web Verisi (Open-Meteo) ve hangi bölümler için RAG dokümanlarını kullandığını belirt.

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
      // Slightly reduce confidence when live weather grounding was unavailable,
      // since frost-risk advice then relies solely on potentially stale local records.
      if (!liveWeather.available) {
        score = Math.max(0.5, score - 0.1);
      }

      // 8. Create recommendation record in DB. usedWeatherCount reflects the
      // combined number of weather data points (local historical + live
      // forecast days) that actually grounded this recommendation.
      const timestamp = new Date().toISOString();
      const recommendation = await aiRecommendationRepository.create({
        parcelId,
        recommendationType: "Genel",
        content: response.text.trim(),
        confidenceScore: parseFloat(score.toFixed(2)),
        usedDocumentsCount: similarChunks.length,
        usedObservationsCount: parcelObservations.length,
        usedWeatherCount: recentWeather.length + liveWeather.daysUsed,
        usedInventoryCount: allInventory.length,
        createdDate: timestamp,
      });

      logger.info(
        "AI",
        `Generated customized expert advisory report for parcel: '${parcel.name}'. Canlı hava durumu kullanıldı: ${liveWeather.available ? "EVET" : "HAYIR"}.`
      );
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

  /**
   * Analyzes the visual development of a parcel over a date range by sending
   * its chronologically ordered field photos to Gemini's multimodal vision model.
   * Compares plant/tree condition (foliage density, color, fruit presence,
   * visible disease/stress signs) across the selected time window.
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
      // 1. Validate parcel
      const parcel = await parcelRepository.getById(parcelId);
      if (!parcel) {
        throw new Error("Analiz istenen parsel kaydı bulunamadı.");
      }

      // 2. Validate date range
      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
        throw new Error("Geçersiz tarih aralığı formatı.");
      }
      if (rangeStart.getTime() > rangeEnd.getTime()) {
        throw new Error("Başlangıç tarihi, bitiş tarihinden sonra olamaz.");
      }

      // 3. Fetch all photos for this parcel (joined through observations)
      const allParcelPhotos = await photoRepository.getPhotosByParcelId(parcelId);

      // 4. Filter to the requested date range using takenAt (fallback to createdAt)
      // and sort chronologically ascending so the model perceives a timeline.
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

      // 5. Cap the number of photos sent to the model to control payload size
      // and latency. If more are available, sample evenly across the timeline
      // while always keeping the first and last photo for accurate before/after comparison.
      const MAX_PHOTOS = 12;
      const sampledPhotos = this.sampleEvenly(photosInRange, MAX_PHOTOS);

      // 6. Build multimodal request parts: an instruction text followed by
      // interleaved date-label + image pairs, in chronological order.
      const dateFormatter = new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "long", day: "numeric" });
      const introText = `
Sen Mersin Toroslar ve Değirmençay bölgesinde uzmanlaşmış bir Tarım Danışmanısın (Mersin Tarım Asistanı).
Aşağıda "${parcel.name}" adlı parsele (Ürün Türü: ${parcel.cropType}, ${parcel.areaDekar} Dekar, ${parcel.treeCount} adet ${parcel.cropType === "Zeytin" ? "ağaç" : "bitki"}) ait, ${dateFormatter.format(rangeStart)} ile ${dateFormatter.format(rangeEnd)} arasında çekilmiş, kronolojik sıraya dizilmiş ${sampledPhotos.length} saha fotoğrafı bulunuyor. Her fotoğraftan hemen önce çekildiği tarih belirtilmiştir.

Bu fotoğrafları zaman sırasına göre inceleyerek parseldeki gelişimi analiz et:
1. **Görsel Değişim Özeti**: Yaprak yoğunluğu/rengi, dallanma, meyve/çiçek varlığı gibi gözle görülür değişimleri tarih sırasıyla anlat.
2. **Sağlık Değerlendirmesi**: Fotoğraflarda hastalık, zararlı, susuzluk veya besin eksikliği belirtisi (yaprak sararması, leke, dökülme vb.) görüyorsan belirt.
3. **Gelişim Hızı Yorumu**: Bu süre zarfında gelişimin normal, yavaş veya hızlı olduğuna dair bölgesel (Toroslar mikro-klimasına uygun) bir değerlendirme yap.
4. **Öneri**: Gözlemlerine dayanarak somut bir sonraki adım öner.

${userQuery ? `Çiftçinin özel olarak odaklanmanı istediği konu: "${userQuery}"` : ""}

Cevabını Markdown formatında, net başlıklarla ve profesyonel/samimi bir Türkçe tonuyla yaz. Sadece görebildiğin şeyleri yorumla, fotoğraflarda net olarak görünmeyen hiçbir şeyi varsayma.
`.trim();

      const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [
        { text: introText },
      ];

      for (const photo of sampledPhotos) {
        const parsed = this.parseDataUrl(photo.originalUrl);
        if (!parsed) {
          logger.error("AI", `Fotoğraf veri formatı çözümlenemedi, atlanıyor. Photo ID: ${photo.id}`);
          continue;
        }
        const photoDate = new Date(photo.takenAt || photo.createdAt);
        parts.push({ text: `[Fotoğraf Tarihi: ${dateFormatter.format(photoDate)}]` });
        parts.push({ inlineData: { data: parsed.base64Data, mimeType: parsed.mimeType } });
      }

      // 7. Call Gemini with multimodal content
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: parts,
      });

      if (!response.text) {
        throw new Error("Yapay zeka asistanından fotoğraf analizi için boş bir cevap döndü.");
      }

      // 8. Persist the recommendation record for history/traceability
      const timestamp = new Date().toISOString();
      const recommendation = await aiRecommendationRepository.create({
        parcelId,
        recommendationType: "Gelişim Analizi",
        content: response.text.trim(),
        confidenceScore: 0.8,
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
    // Deduplicate in case rounding produced repeated indices
    return Array.from(new Set(result));
  }

  /**
   * Parses a base64 data URL (e.g. "data:image/jpeg;base64,/9j/4AAQ...")
   * into its MIME type and raw base64 payload for Gemini's inlineData format.
   */
  private parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
    const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return null;
    }
    return { mimeType: match[1], base64Data: match[2] };
  }
}

export const aiService = new AIService();
