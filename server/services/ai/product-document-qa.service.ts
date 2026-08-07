/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { config } from "../../config";
import { logger } from "../../logger";
import { getGeminiClient, callGeminiWithRetry } from "./gemini-client";
import { aiUsageTrackerService } from "../ai-usage-tracker.service";
import { uploadedDocumentRepository, vectorChunkRepository } from "../../repositories/ai.repository";
import { searchSimilarChunks, expandWithDocumentContext, expandWithAdjacentChunks, filterRelevantMatches, groupMatchesByDocument, MIN_RELEVANT_SIMILARITY_SCORE } from "./rag-retrieval.service";
import { buildProductDocumentQaPrompt, ProductDocumentAnswer } from "../../prompts/product-document-qa.prompt";
import { parseProductDocumentAnswer, ProductDocumentAnswerParseError } from "./product-document-qa.parser";
import { writeDebugFile } from "./debug-io.util";
import { findCriticalSectionChunks } from "./product-critical-sections.util";

/**
 * Sprint 7H — Product Bank RAG Sorgulama Katmanı.
 *
 * Mimari: Document Retrieval (uploadedDocumentRepository.getByLinkedEntity,
 * MEVCUT, DEĞİŞTİRİLMEDİ) → Chunk Selection (searchSimilarChunks +
 * expandWithDocumentContext/expandWithAdjacentChunks, MEVCUT,
 * rag-retrieval.service.ts, DEĞİŞTİRİLMEDİ) → Context Builder (bu
 * dosyada, chat-assistant.service.ts'teki chunk-gruplama desenini
 * TAKLİT EDER — o dosyaya dokunulmadı, davranış BENZER ama BAĞIMSIZ bir
 * kopyadır, çünkü "webFallback" davranışı KASITLI OLARAK yok, bkz.
 * aşağı) → Prompt Builder (product-document-qa.prompt.ts, YENİ, AYRI) →
 * Gemini (gemini-client.ts, MEVCUT, DEĞİŞTİRİLMEDİ — yeni entegrasyon
 * yok) → Answer Parser (product-document-qa.parser.ts, YENİ, AYRI).
 *
 * KRİTİK DAVRANIŞ FARKI (bilinçli, Sprint 7H'nin kesin kuralı gereği):
 * `chat-assistant.service.ts`'in genel sohbet akışı, RAG'de eşleşme
 * yoksa Google Search'e "düşer" (web fallback). Bu servis bunu ASLA
 * yapmaz — belge/eşleşme yoksa Gemini'ye HİÇ istek atmadan, doğrudan
 * "Belgelerde bu bilgi bulunamadı." döner (bkz. Sprint 7H "AI tahmin
 * üretmeyecek").
 */
// Sprint 9.1 — SORUN 1/6: MIN_RELEVANT_SIMILARITY_SCORE artık rag-retrieval.service.ts'ten import ediliyor (PAYLAŞILAN, TEK kaynak) — yerel, bağımsız kopya kaldırıldı.
const NO_DOCUMENTS_MESSAGE = "Bu ürüne bağlı hiçbir belge bulunamadı.";
const NO_RELEVANT_INFO_MESSAGE = "Belgelerde bu bilgi bulunamadı.";

export interface ProductDocumentQaResult extends ProductDocumentAnswer {
  hasLinkedDocuments: boolean;
  usedDocuments: { documentId: string; fileName: string; heading?: string; retrievalScore: number }[];
}

export type ProductDocumentQaOutcome =
  | { success: true; result: ProductDocumentQaResult }
  | { success: false; errorMessage: string };

export class ProductDocumentQaService {
  /**
   * Bir Product Bank kaydına (`productId`) bağlı belgeler üzerinden
   * kullanıcının sorusunu yanıtlar. Asla throw etmez. Belge yoksa veya
   * ilgili bir eşleşme bulunamazsa Gemini'ye HİÇ istek atmadan erken
   * döner (hem "tahmin üretmeme" ilkesi hem "gereksiz API çağrısı
   * yapmama" performans ilkesi için).
   */
  public async ask(productId: string, question: string): Promise<ProductDocumentQaOutcome> {
    if (!question || !question.trim()) {
      return { success: false, errorMessage: "Soru boş olamaz." };
    }

    const linkedDocuments = await uploadedDocumentRepository.getByLinkedEntity("product", productId);
    const hasLinkedDocuments = linkedDocuments.length > 0;

    // Sprint 9.12 — KÖK NEDEN DÜZELTMESİ (kod kanıtıyla doğrulandı):
    // ÖNCEDEN, `linkedDocuments.length===0` durumunda SESSİZCE erken
    // dönülüyordu — searchSimilarChunks() HİÇ ÇAĞRILMIYORDU, kullanıcı
    // "10 5 40" gibi tam eşleşmeyen bir productId girdiğinde (ya da
    // ürün-belge bağlantısı hiç kurulmadığında), Retriever'ın GERÇEKTEN
    // sorguyu çalıştırabilecek durumda olmasına RAĞMEN hiç
    // çalıştırılmıyordu.
    //
    // Artık: bağlantı bulunamazsa, `documentIds` scope'u KALDIRILIYOR
    // (undefined) — searchSimilarChunks() bu durumda ZATEN "documentIds
    // yoksa TÜM havuzu tara" davranışına (Karar Destek'in kullandığı
    // AYNI, MEVCUT, DEĞİŞTİRİLMEMİŞ mekanizma) sahip. AKIŞIN GERİ KALANI
    // (filterRelevantMatches, threshold kontrolü, expandWith*,
    // groupMatchesByDocument, prompt, Gemini) HİÇ DEĞİŞMEDİ — yeni kod
    // değil, mevcut retrieval akışının yeniden kullanımı.
    //
    // Sprint 7H'nin "asla web fallback yapma" kuralı BOZULMUYOR — bu,
    // hâlâ RAG içinde (documentIds scope'u genişletilerek) kalan bir
    // davranış, web/Google Search'e HİÇ gidilmiyor.
    if (!hasLinkedDocuments) {
      logger.info("AI", `[Belgelere Sor] productId="${productId}" için bağlı belge bulunamadı — genel (scope'suz) semantik RAG aramasına düşülüyor.`);
    }
    const documentIds = hasLinkedDocuments ? linkedDocuments.map((d) => d.id) : undefined;
    const rawMatches = await searchSimilarChunks(question, 4, documentIds, question);

    // Sprint 9.1 — SORUN 1/6: PAYLAŞILAN (rag-retrieval.service.ts)
    // eşik filtresi — context-builder.service.ts (Karar Destek) de
    // artık AYNI fonksiyonu kullanıyor, kod tekrarı yok.
    const initialMatches = filterRelevantMatches(rawMatches);

    const hasRelevantMatch = initialMatches.length > 0;
    if (!hasRelevantMatch) {
      return {
        success: true,
        result: {
          answer: hasLinkedDocuments ? NO_RELEVANT_INFO_MESSAGE : NO_DOCUMENTS_MESSAGE,
          confidence: 0,
          citations: [],
          warnings: [],
          hasLinkedDocuments,
          usedDocuments: [],
        },
      };
    }

    const matches = await expandWithAdjacentChunks(await expandWithDocumentContext(initialMatches, question));

    // Sprint 9.24 — KÖK NEDEN DÜZELTMESİ (kod kanıtıyla doğrulandı):
    // `expandWithDocumentContext` yalnızca EN İYİ eşleşmenin belgesinden,
    // en fazla 2 (ve yine embedding-skor eşikli) ek chunk getiriyordu —
    // "Kullanma Şekli"/"Doz"/"Uyarılar" gibi bölümler, sorguyla embedding
    // benzerliği düşükse HİÇBİR aşamada garanti edilmiyordu. Artık, ürüne
    // bağlı TÜM belgelerin TÜM chunk'ları arasından, kritik bölüm
    // başlıklarına uyanlar SKORDAN BAĞIMSIZ olarak context'e ekleniyor.
    // Mevcut similarity/threshold/expandWith*/ranking mantığının HİÇBİRİ
    // değiştirilmedi — bu, TAMAMEN EK bir adım. Yalnızca gerçek ürün
    // bağlantısı varken (documentIds scope'lu) çalışır.
    let matchesWithCriticalSections = matches;
    if (hasLinkedDocuments && documentIds) {
      const allProductChunks = (await vectorChunkRepository.getAll()).filter((c) => documentIds.includes(c.documentId));

      // *** SPRINT 9.26 — GEÇİCİ DEBUG BLOĞU A: Ürün Chunk Envanteri ***
      const fileNameByDocId = new Map<string, string>();
      for (const c of allProductChunks) {
        if (!fileNameByDocId.has(c.documentId)) {
          const doc = await uploadedDocumentRepository.getById(c.documentId);
          fileNameByDocId.set(c.documentId, doc?.fileName ?? "(bilinmeyen belge)");
        }
      }
      logger.info(
        "AI",
        `[ÜRÜN CHUNK ENVANTERİ] Toplam Chunk: ${allProductChunks.length} | ${JSON.stringify(
          allProductChunks.map((c) => ({
            chunkId: c.id,
            fileName: fileNameByDocId.get(c.documentId),
            heading: c.heading ?? null,
            chunkIndex: c.chunkIndex,
            preview: (c.content || "").slice(0, 150),
            topics: c.topics ?? null,
            keywords: c.keywords ?? null,
            cropType: c.cropType ?? null,
          }))
        )}`
      );

      const criticalChunks = findCriticalSectionChunks(allProductChunks);

      // *** SPRINT 9.26 — GEÇİCİ DEBUG BLOĞU C: Kritik Bölüm Analizi ***
      const CRITICAL_SECTION_KEYWORDS_FOR_DEBUG = ["kullanma şekli", "kullanım dozu", "kullanma dozu", "uygulama zaman", "uygulama şekli", "karışabilirlik", "depolama", "uyarı", "ilk yardım", "hasat süresi", "bekleme süresi"];
      for (const targetHeading of CRITICAL_SECTION_KEYWORDS_FOR_DEBUG) {
        const matchingChunks = allProductChunks.filter((c) => {
          const headingMatch = (c.heading ?? "").toLocaleLowerCase("tr-TR").includes(targetHeading);
          const contentMatch = (c.content || "").slice(0, 200).toLocaleLowerCase("tr-TR").includes(targetHeading);
          const keywordMatch = (c.keywords ?? []).some((k) => k.toLocaleLowerCase("tr-TR").includes(targetHeading));
          const topicMatch = (c.topics ?? []).some((t) => t.toLocaleLowerCase("tr-TR").includes(targetHeading));
          return headingMatch || contentMatch || keywordMatch || topicMatch;
        });
        logger.info(
          "AI",
          `[KRİTİK BÖLÜM ANALİZİ] Aranan Başlık: "${targetHeading}" | Bulunan Chunk Sayısı: ${matchingChunks.length} | ${JSON.stringify(
            matchingChunks.map((c) => ({
              chunkId: c.id,
              headingEslesti: (c.heading ?? "").toLocaleLowerCase("tr-TR").includes(targetHeading),
              contentEslesti: (c.content || "").slice(0, 200).toLocaleLowerCase("tr-TR").includes(targetHeading),
              keywordEslesti: (c.keywords ?? []).some((k) => k.toLocaleLowerCase("tr-TR").includes(targetHeading)),
              topicEslesti: (c.topics ?? []).some((t) => t.toLocaleLowerCase("tr-TR").includes(targetHeading)),
            }))
          )}${matchingChunks.length === 0 ? " | SONUÇ: Bu başlıkla eşleşen HİÇBİR chunk bulunamadı (ne heading'de, ne content'in ilk 200 karakterinde, ne keywords'te, ne topics'te)." : ""}`
        );
      }

      const alreadyIncludedIds = new Set(matches.map((m) => m.chunk.id));
      const newCriticalMatches = criticalChunks
        .filter((c) => !alreadyIncludedIds.has(c.id))
        .map((chunk) => ({ chunk, score: MIN_RELEVANT_SIMILARITY_SCORE }));
      if (newCriticalMatches.length > 0) {
        logger.info(
          "AI",
          `[Kritik Bölüm Garantisi] ${newCriticalMatches.length} ek chunk (yalnızca kritik başlık eşleşmesiyle, embedding skorundan bağımsız) context'e eklendi: ${JSON.stringify(newCriticalMatches.map((m) => ({ chunkId: m.chunk.id, heading: m.chunk.heading ?? null })))}`
        );
      }
      matchesWithCriticalSections = [...matches, ...newCriticalMatches];

      // *** SPRINT 9.26 — GEÇİCİ DEBUG BLOĞU B: Retrieval Karar Logu ***
      const finalIncludedIds = new Set(matchesWithCriticalSections.map((m) => m.chunk.id));
      const scoreByChunkId = new Map(matchesWithCriticalSections.map((m) => [m.chunk.id, m.score]));
      const initialIncludedIds = new Set(initialMatches.map((m) => m.chunk.id));
      const expandedIncludedIds = new Set(matches.map((m) => m.chunk.id));
      logger.info(
        "AI",
        `[RETRIEVAL KARAR LOGU] ${JSON.stringify(
          allProductChunks.map((c) => {
            const inFinal = finalIncludedIds.has(c.id);
            let elenmeNedeni: string | null = null;
            if (!inFinal) {
              if (!initialIncludedIds.has(c.id) && !expandedIncludedIds.has(c.id)) {
                elenmeNedeni = "Similarity/Threshold aşamasında elendi (searchSimilarChunks top-K veya 0.55 eşiği altında kaldı) VE kritik başlık eşleşmesi yok";
              } else {
                elenmeNedeni = "Beklenmeyen durum — initial/expanded içinde ama final'de yok";
              }
            }
            return {
              chunkId: c.id,
              heading: c.heading ?? null,
              similarity: scoreByChunkId.get(c.id) ?? null,
              topK: expandedIncludedIds.has(c.id),
              threshold: initialIncludedIds.has(c.id),
              criticalSection: criticalChunks.some((cc) => cc.id === c.id),
              promptContext: inFinal,
              elenmeNedeni,
            };
          })
        )}`
      );
    }

    // Sprint 9.1 — SORUN 2/3/6: PAYLAŞILAN (rag-retrieval.service.ts)
    // gruplama fonksiyonu — daha önce burada bağımsız bir kopya vardı.
    const orderedGroups = groupMatchesByDocument(matchesWithCriticalSections);
    const orderedMatches = orderedGroups.flat();

    const ragContext = orderedMatches
      .map((m, idx) => `[Referans ${idx + 1}] (documentId: ${m.chunk.documentId}): ${m.chunk.content}`)
      .join("\n\n");
    logger.info(
      "AI",
      `[Prompt Context — Belgelere Sor] ${orderedMatches.length} chunk prompt'a eklenecek: ${JSON.stringify(
        await Promise.all(
          orderedMatches.map(async (m) => ({
            chunkId: m.chunk.id,
            documentId: m.chunk.documentId,
            // Sprint 9.25 — "title"/"page" alanları VectorChunk modelinde
            // HİÇ YOK (server/models.ts:813-819'da doğrulandı) — uydurulmadı.
            // Gerçek karşılıkları: fileName (belgenin gerçek adı) ve
            // chunkIndex (chunk'ın belge içindeki gerçek sırası).
            fileName: (await uploadedDocumentRepository.getById(m.chunk.documentId))?.fileName ?? "(bilinmeyen belge)",
            heading: m.chunk.heading ?? null, // <-- kullanıcının özellikle istediği alan
            chunkIndex: m.chunk.chunkIndex,
            score: m.score.toFixed(4),
            preview: m.chunk.content.slice(0, 150),
          }))
        )
      )}`
    );

    const prompt = buildProductDocumentQaPrompt(ragContext, question.trim());
    writeDebugFile("debug_last_prompt.txt", prompt); // Sprint 9.15 — yalnızca DEBUG_PROMPT=true iken yazar

    let rawText: string;
    try {
      const client = getGeminiClient();
      const response = await callGeminiWithRetry(() => {
        aiUsageTrackerService.recordUsage(config.ai.generationModel);
        return client.models.generateContent({ model: config.ai.generationModel, contents: prompt });
      });
      rawText = response.text?.trim() || "";
      writeDebugFile("debug_raw_response.txt", rawText); // Sprint 9.15 — HAM, hiç parse/temizleme öncesi
      if (!rawText) throw new Error("Gemini boş bir yanıt döndürdü.");
      logger.info("AI", `[Gemini Response — Belgelere Sor] ${rawText.slice(0, 300)}`);
    } catch (error) {
      logger.error("AI", "Product Document QA sağlayıcı çağrısı başarısız oldu.", error);
      return { success: false, errorMessage: "Belgelere dayalı yanıt şu anda oluşturulamadı." };
    }

    let answer: ProductDocumentAnswer;
    try {
      answer = parseProductDocumentAnswer(rawText);
    } catch (error) {
      const isParseError = error instanceof ProductDocumentAnswerParseError;
      logger.error("AI", "Product Document QA yanıtı ayrıştırılamadı.", error);
      return { success: false, errorMessage: isParseError ? error.message : "Yanıt işlenemedi." };
    }

    const usedDocuments: { documentId: string; fileName: string; heading?: string; retrievalScore: number }[] = [];
    for (const group of orderedGroups) {
      const doc = await uploadedDocumentRepository.getById(group[0].chunk.documentId);
      usedDocuments.push({
        documentId: group[0].chunk.documentId,
        fileName: doc?.fileName ?? "(bilinmeyen belge)",
        heading: group[0].chunk.heading,
        // Sprint 9.1 — SORUN 3: bu belgeden gelen chunk'lar arasındaki EN
        // YÜKSEK benzerlik skoru (gerçekte var olan tek veri — sayfa/
        // bölüm numarası VectorChunk modelinde YOK, uydurulmuyor).
        retrievalScore: Math.max(...group.map((m) => m.score)),
      });
    }

    return {
      success: true,
      result: { ...answer, hasLinkedDocuments, usedDocuments },
    };
  }
}

export const productDocumentQaService = new ProductDocumentQaService();
