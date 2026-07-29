/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../logger";
import { config } from "../../config";
import { aiUsageTrackerService } from "../ai-usage-tracker.service";
import { capUserQueryLength } from "../../prompts/prompt-safety.util";
import { buildChatAssistantPrompt } from "../../prompts/chat-assistant.prompt";
import { getGeminiClient, callGeminiWithRetry } from "./gemini-client";
import { searchSimilarChunks, expandWithDocumentContext, expandWithAdjacentChunks } from "./rag-retrieval.service";
import { uploadedDocumentRepository } from "../../repositories/ai.repository";
import { contextBuilderService } from "./context-builder.service";
import { intentRouterService } from "./intent-router.service";
import { plantKnowledgeService } from "./plant-knowledge.service";
import { inventoryItemRepository } from "../../repositories/inventory.repository";
import { costRepository, saleRepository } from "../../repositories/finance.repository";
import { confidenceService, ConfidenceResult, ConfidenceSignals } from "./confidence.service";

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
 * Minimum cosine similarity score for a RAG chunk to be considered a
 * genuine match for the user's question. Below this, the retrieved
 * chunk is likely unrelated "closest available" noise rather than an
 * actual answer — in that case the knowledge base is treated as having
 * no relevant information, triggering the web-search fallback (see
 * queryChatAssistant) rather than answering from a barely-related chunk.
 */
const MIN_RELEVANT_SIMILARITY_SCORE = 0.55;

/**
 * Sprint 2E — Kaynak Bilgisi (şeffaflık) veri yapısı.
 *
 * `sourceType`, yalnızca "RAG" veya "Gemini" olabilir — "Hibrit" (RAG +
 * Gemini web) seçeneği BİLİNÇLİ OLARAK eklenmedi: kod mimarisi
 * incelendiğinde (bkz. queryChatAssistant, googleSearch aracının
 * yalnızca webFallbackEnabled=true iken Gemini'ye verildiği), "RAG
 * bulundu AMA Gemini ayrıca web'e de gitti" durumu teknik olarak
 * MÜMKÜN DEĞİL — bu iki mod birbirini dışlıyor. Var olmayan bir
 * ayrımı "Hibrit" etiketiyle uydurmak yerine, yalnızca gerçekten
 * ayırt edilebilen iki durum gösteriliyor.
 */
export interface RagSourceDocument {
  documentId: string;
  fileName: string;
  headings: string[];
  /** Bu dokümandan gelen chunk'lar arasındaki EN YÜKSEK benzerlik skoru — kullanıcı güven puanı değildir, yalnızca Retrieval'ın ham benzerlik skorudur. */
  score: number;
}

export interface RagSourceInfo {
  sourceType: "RAG" | "Gemini";
  documents: RagSourceDocument[];
}

/**
 * Sprint 4F — Görev 8 (API cevabını bozma, mevcut modeli genişlet):
 * `confidence` yeni bir alandır — mevcut `text`/`usedChunks`/`sources`
 * alanlarına hiç dokunulmadı, eski istemciler bu alanı görmezden
 * gelebilir.
 */
export interface ChatAssistantResult {
  text: string;
  usedChunks: string[];
  sources: RagSourceInfo;
  confidence: ConfidenceResult;
}

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
 * Answers free-text agricultural questions using loaded RAG documentation.
 */
export class ChatAssistantService {
  /**
   * Generates a generic agriculture-related prompt query answer (Chat mode) using loaded RAG documentation.
   * Trivial greetings/thanks are answered locally without calling Gemini
   * at all (see `isTrivialGreeting`), since they carry no agricultural
   * question content to ground an AI response in.
   *
   * @param userQuery The farmer's free-text question
   * @param documentIds Optional scoping filter (see searchSimilarChunks).
   *   Used for equipment-specific troubleshooting support: when a
   *   caller passes the document IDs belonging to one piece of
   *   equipment's uploaded manual, the answer is grounded ONLY in that
   *   manual, never mixed with the general farming knowledge base — this
   *   is a deliberate accuracy choice (see AI PHILOSOPHY / RAG
   *   principles: AI must never produce information that contradicts or
   *   is unrelated to the retrieved source documents). If an empty array
   *   is passed (the entity has no documents uploaded yet), Gemini is
   *   never called — there is nothing to ground an answer in, and
   *   guessing about equipment troubleshooting without its manual would
   *   violate the "never present uncertain information as certain"
   *   principle.
   * @param scopeLabel When set, names the specific equipment this call
   *   is scoped to (e.g. "Honda GX35 Çapa Motoru"), triggering the
   *   stricter equipment-troubleshooting prompt variant (see
   *   buildChatAssistantPrompt). Only meaningful together with
   *   documentIds; omit for the general chat assistant.
   */
  /**
   * Sprint 4F — Görev 7 (kod tekrarına izin verme) + Görev 9 (confidence
   * loglama). Confidence hesaplamasını, loglamasını ve nihai sonuç
   * nesnesinin üretilmesini TEK bir yerde birleştirir — her dönüş
   * noktası bu fonksiyonu çağırır, kendi puanlama/loglama mantığını
   * TEKRARLAMAZ.
   */
  private finalizeResult(
    text: string,
    usedChunks: string[],
    sources: RagSourceInfo,
    signals: ConfidenceSignals
  ): ChatAssistantResult {
    const confidence = confidenceService.calculate(signals);
    logger.info("AI", `Confidence hesaplandı: ${confidence.confidence}/100`, {
      intent: signals.intent,
      reasons: confidence.reasons,
    });
    return { text, usedChunks, sources, confidence };
  }

  public async queryChatAssistant(userQuery: string, documentIds?: string[], scopeLabel?: string): Promise<ChatAssistantResult> {
    const safeQuery = capUserQueryLength(userQuery);

    if (isTrivialGreeting(safeQuery)) {
      return this.finalizeResult(
        "Merhaba! Ben Mersin AgriTech RAG asistanınızım. Zeytin tarımı, hastalık teşhisi veya yüklediğiniz dokümanlarla ilgili bir soru sorabilirsiniz.",
        [], { sourceType: "Gemini", documents: [] },
        { intent: "GeneralChat", usedGemini: false, usedRetrieval: false, usedPlantKnowledge: false, usedFallback: false, retrievalResultCount: 0, retrievalScores: [] }
      );
    }

    if (documentIds && documentIds.length === 0) {
      return this.finalizeResult(
        "Bu ekipman için henüz bir kullanım kılavuzu yüklenmemiş. Sağlıklı bir arıza tavsiyesi verebilmem için lütfen önce ekipmanın kullanım kılavuzunu (PDF/DOCX/TXT) yükleyin.",
        [], { sourceType: "Gemini", documents: [] },
        { intent: "GeneralChat", usedGemini: false, usedRetrieval: false, usedPlantKnowledge: false, usedFallback: false, retrievalResultCount: 0, retrievalScores: [] }
      );
    }

    // Sprint 4E — Intent Activation. Ekipman-bazlı (documentIds/scopeLabel)
    // çağrılar Intent Router'ın DIŞINDA tutulur — bu, zaten kendi başına
    // sıkı bir kapsamı (yalnızca o ekipmanın kılavuzu) olan, ayrı bir
    // akış; Intent Router'ın genel tarım sınıflandırması burada anlamlı
    // değil ve mevcut, çalışan davranışı bozma riski taşırdı.
    if (documentIds) {
      return this.runGeneralChatFlow(safeQuery, documentIds, scopeLabel);
    }

    const startTime = Date.now();
    const intentResult = intentRouterService.classify({
      userMessage: safeQuery,
      hasParcelContext: false, // Genel Sohbet hiçbir zaman parsel bağlamıyla çağrılmıyor (mevcut, gerçek davranış)
    });

    try {
      switch (intentResult.intent) {
        case "InventoryQuestion":
          return await this.runWithFallback(
            () => this.handleInventoryQuestion(safeQuery),
            () => this.runGeneralChatFlow(safeQuery, documentIds, scopeLabel, undefined, "InventoryQuestion", true),
            intentResult, startTime, "Inventory Repository → (gerekirse) Gemini"
          );
        case "FinanceQuestion":
          return await this.runWithFallback(
            () => this.handleFinanceQuestion(safeQuery),
            () => this.runGeneralChatFlow(safeQuery, documentIds, scopeLabel, undefined, "FinanceQuestion", true),
            intentResult, startTime, "Finance Repository → (gerekirse) Gemini"
          );
        case "PlantInformation": {
          // Sprint 4E — kullanıcı sorgusunda sözlükte KAYITLI bir bitki
          // adı tespit edilirse, Context Builder'a bu bilgi
          // `overrideCropType` olarak geçirilir (parcelId olmadan da
          // Plant Knowledge'ın devreye girmesini sağlar). Tespit
          // edilemezse mevcut Genel Sohbet akışı DEĞİŞMEDEN çalışır.
          const detectedPlant = await plantKnowledgeService.detectPlantNameInText(safeQuery);
          try {
            return await this.runGeneralChatFlow(safeQuery, documentIds, scopeLabel, detectedPlant ?? undefined, "PlantInformation");
          } finally {
            // try/finally: sonuç başarılı da olsa, hata da fırlatılsa,
            // yönlendirme kararı MUTLAKA loglanır (Görev 5).
            this.logRoutingDecision(intentResult, startTime, "Context Builder → Plant Knowledge → Enhanced Retrieval → Gemini", true, true, !!detectedPlant);
          }
        }
        case "ParcelHistory":
          // Sprint 4E — Görev 7 (Fallback): Genel Sohbet'in hiçbir zaman
          // bir parcelId'si olmadığı için (bkz. yukarıdaki
          // hasParcelContext: false), "hangi parselin geçmişi"
          // belirlenemez — bu intent burada GÜVENLİ ŞEKİLDE Genel
          // Sohbet akışına düşer, hatalı/yanlış bir parsel varsaymaz.
          try {
            return await this.runGeneralChatFlow(safeQuery, documentIds, scopeLabel, undefined, "ParcelHistory", true);
          } finally {
            this.logRoutingDecision(intentResult, startTime, "Fallback: parcelId yok → GeneralChat", true, true, false);
          }
        default:
          // GeneralChat, ParcelRecommendation (Genel Sohbet'te zaten hiç
          // tetiklenmiyor, requiresParcelContext kuralı engelliyor),
          // WeatherRelated, FarmManagement, GeneralAgriculture, Unknown
          // — hepsi mevcut, değişmemiş RAG akışına gider.
          try {
            return await this.runGeneralChatFlow(safeQuery, documentIds, scopeLabel, undefined, intentResult.intent);
          } finally {
            this.logRoutingDecision(intentResult, startTime, "Context Builder → Enhanced Retrieval → Gemini (GeneralChat)", true, true, false);
          }
      }
    } catch (error) {
      logger.error("AI", "Error inside general chat assistant query", error);
      throw error;
    }
  }

  /**
   * Sprint 4E — Görev 7 (Fallback Mekanizması). Yeni (Sprint 4E'de
   * eklenen) bir işlem hattı BEKLENMEDİK şekilde hata verirse, kullanıcı
   * cevapsız bırakılmaz — güvenli, mevcut Genel Sohbet akışına
   * (RAG + Gemini) sessizce düşülür. Hata loglanır, kullanıcıya
   * yansıtılmaz.
   */
  private async runWithFallback(
    primary: () => Promise<ChatAssistantResult>,
    fallback: () => Promise<ChatAssistantResult>,
    intentResult: { intent: string; matchedKeywords: string[] },
    startTime: number,
    pipelineDescription: string
  ): Promise<ChatAssistantResult> {
    try {
      const result = await primary();
      this.logRoutingDecision(intentResult, startTime, pipelineDescription, false, false, false);
      return result;
    } catch (error) {
      logger.error("AI", `Intent handler başarısız oldu (${intentResult.intent}), GeneralChat akışına düşülüyor.`, error);
      try {
        return await fallback();
      } finally {
        // try/finally: fallback'in KENDİSİ de hata verse bile (örn. API
        // anahtarı hiç yoksa), yönlendirme kararı MUTLAKA loglanır.
        this.logRoutingDecision(intentResult, startTime, `FALLBACK (${pipelineDescription} başarısız) → GeneralChat`, true, true, false);
      }
    }
  }

  /** Sprint 4E — Görev 5: her yönlendirme kararı için zorunlu, ayrıntılı log. */
  private logRoutingDecision(
    intentResult: { intent: string; matchedKeywords: string[] },
    startTime: number,
    pipeline: string,
    usedRetrieval: boolean,
    usedGemini: boolean,
    usedPlantKnowledge: boolean
  ): void {
    logger.info("AI", `Intent Router yönlendirmesi tamamlandı: ${intentResult.intent}`, {
      matchedKeywords: intentResult.matchedKeywords,
      pipeline,
      usedGemini,
      usedRetrieval,
      usedPlantKnowledge,
      responseTimeMs: Date.now() - startTime,
    });
  }

  /**
   * Sprint 4E — YENİ, doğrudan veritabanı işlem hattı. RAG/Context
   * Builder'ın ağır toplama işlemleri ATLANIR (gereksiz — bkz. Görev 3);
   * yalnızca envanter verisi toplanıp, kullanıcının serbest metin
   * sorusuna DOĞAL DİLDE cevap verebilmesi için KISA bir prompt'la
   * Gemini'ye verilir.
   */
  private async handleInventoryQuestion(safeQuery: string): Promise<ChatAssistantResult> {
    const allInventory = await inventoryItemRepository.getAll();
    const inventoryText = allInventory.length > 0
      ? allInventory.map((i) => `- ${i.name}: ${i.stockQuantity} ${i.unit} (Kritik Seviye: ${i.minStockAlert} ${i.unit})`).join("\n")
      : "Envanterde hiç kayıtlı ürün bulunmuyor.";

    const prompt = `Aşağıda çiftliğin GERÇEK, güncel envanter listesi verilmiştir. Kullanıcının sorusunu YALNIZCA bu listeye dayanarak, kısa ve net cevapla. Listede olmayan bir bilgiyi UYDURMA; sorulan ürün listede yoksa bunu açıkça belirt.\n\n=== ENVANTER (KAYNAK: Yerel Proje Verisi) ===\n${inventoryText}\n\n=== SORU ===\n${safeQuery}`;

    const client = getGeminiClient();
    const response = await callGeminiWithRetry(() => {
      aiUsageTrackerService.recordUsage(config.ai.generationModel);
      return client.models.generateContent({ model: config.ai.generationModel, contents: prompt });
    });

    return this.finalizeResult(
      response.text ? response.text.trim() : "Yapay zeka asistanından bir yanıt alınamadı.",
      [], { sourceType: "Gemini", documents: [] },
      { intent: "InventoryQuestion", usedGemini: true, usedRetrieval: false, usedPlantKnowledge: false, usedFallback: false, retrievalResultCount: 0, retrievalScores: [] }
    );
  }

  /**
   * Sprint 4E — YENİ, doğrudan veritabanı işlem hattı (Mali Defter).
   * Aynı desen: RAG/Context Builder atlanır, yalnızca gerçek mali
   * kayıtlar toplanıp kısa bir prompt'la Gemini'ye verilir.
   */
  private async handleFinanceQuestion(safeQuery: string): Promise<ChatAssistantResult> {
    const [costs, sales] = await Promise.all([costRepository.getAll(), saleRepository.getAll()]);

    const recentCosts = costs
      .sort((a, b) => new Date(b.costDate).getTime() - new Date(a.costDate).getTime())
      .slice(0, 10);
    const recentSales = sales
      .sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
      .slice(0, 10);

    const costsText = recentCosts.length > 0
      ? recentCosts.map((c) => `- ${c.costDate}: ${c.category} - ${c.amount} TL${c.description ? ` (${c.description})` : ""}`).join("\n")
      : "Kayıtlı maliyet bulunmuyor.";
    const salesText = recentSales.length > 0
      ? recentSales.map((s) => `- ${s.saleDate}: ${s.productType}, ${s.quantityKg} kg, ${s.totalRevenue} TL`).join("\n")
      : "Kayıtlı satış bulunmuyor.";

    const prompt = `Aşağıda çiftliğin GERÇEK, güncel mali kayıtları (son 10 maliyet, son 10 satış) verilmiştir. Kullanıcının sorusunu YALNIZCA bu verilere dayanarak, kısa ve net cevapla. Veride olmayan bir rakamı UYDURMA.\n\n=== SON MALİYETLER (KAYNAK: Yerel Proje Verisi) ===\n${costsText}\n\n=== SON SATIŞLAR (KAYNAK: Yerel Proje Verisi) ===\n${salesText}\n\n=== SORU ===\n${safeQuery}`;

    const client = getGeminiClient();
    const response = await callGeminiWithRetry(() => {
      aiUsageTrackerService.recordUsage(config.ai.generationModel);
      return client.models.generateContent({ model: config.ai.generationModel, contents: prompt });
    });

    return this.finalizeResult(
      response.text ? response.text.trim() : "Yapay zeka asistanından bir yanıt alınamadı.",
      [], { sourceType: "Gemini", documents: [] },
      { intent: "FinanceQuestion", usedGemini: true, usedRetrieval: false, usedPlantKnowledge: false, usedFallback: false, retrievalResultCount: 0, retrievalScores: [] }
    );
  }

  /**
   * Sprint 4A-4C'de kurulan, DEĞİŞMEMİŞ Genel Sohbet (RAG) akışı —
   * yalnızca `queryChatAssistant`'ın ana gövdesinden buraya taşındı
   * (kod tekrarını önlemek için, çünkü artık birden fazla intent aynı
   * akışa düşüyor). `overridePlantName` verilirse (Sprint 4E,
   * PlantInformation intent'i), Context Builder'a `overrideCropType`
   * olarak geçirilir; verilmezse davranış TAMAMEN eskisiyle aynıdır.
   */
  private async runGeneralChatFlow(
    safeQuery: string,
    documentIds?: string[],
    scopeLabel?: string,
    overridePlantName?: string,
    intent: string = "GeneralChat",
    isFallback: boolean = false
  ): Promise<ChatAssistantResult> {
    // Sprint 4A — arama TERİMİ/ham RAG sonucu artık ortak
    // ContextBuilderService üzerinden alınıyor. `useMetadataBoost:
    // true` ve `ragLimit: 3`, Sprint 2D'de buradaki ÖNCEKİ çağrının
    // (`searchSimilarChunks(safeQuery, 3, documentIds, safeQuery)`)
    // BİREBİR aynısını üretecek şekilde ayarlandı — davranış değişmedi.
    const context = await contextBuilderService.buildContext({
      userQuery: safeQuery,
      documentIds,
      useMetadataBoost: true,
      ragLimit: 3,
      overrideCropType: overridePlantName,
    });
    const initialMatches = context.ragMatches;

    // A knowledge base "match" whose top score falls below the
    // relevance threshold is really just the least-dissimilar chunk
    // available, not a genuine answer — treated the same as no match
    // at all, which is what triggers the web-search fallback below.
    // ÖNEMLİ: Bu karar, GENİŞLETME ÖNCESİ orijinal Top-3'ün en yüksek
    // skoruna göre veriliyor — Aşama 1/2'nin eklediği ek chunk'lar
    // (özellikle adjacent chunk'lar, skor=0) bu kararı etkilemiyor.
    const hasRelevantMatch = initialMatches.length > 0 && initialMatches[0].score >= MIN_RELEVANT_SIMILARITY_SCORE;
    const webFallbackEnabled = !hasRelevantMatch;

    // Sprint 2D — Aşama 1 + 2: yalnızca gerçek bir eşleşme varken
    // (RAG kullanılacaksa) ek bağlam genişletmesi yapılır — alakasız
    // bir sonucu daha da büyütmenin bir anlamı yok.
    const matches = hasRelevantMatch
      ? await expandWithAdjacentChunks(await expandWithDocumentContext(initialMatches, safeQuery))
      : initialMatches;

    // Sprint 2D — Aşama 4: Context Assembly v2. Chunk'lar artık
    // documentId'ye göre gruplanıp, her grup içinde chunkIndex sırasına
    // göre (belgedeki doğal akışı koruyarak) sunuluyor — önceki sürüm
    // yalnızca ham benzerlik sırasında (karışık dokümanlar, karışık
    // sıra) sunuyordu. Prompt ŞABLONUNUN kendisi (buildChatAssistantPrompt)
    // DEĞİŞMEDİ — yalnızca ona gönderilen ragContext metninin
    // düzenlenme sırası iyileştirildi.
    const groupedByDocument = new Map<string, typeof matches>();
    for (const m of matches) {
      const list = groupedByDocument.get(m.chunk.documentId) ?? [];
      list.push(m);
      groupedByDocument.set(m.chunk.documentId, list);
    }
    // Doküman grupları, o dokümandaki EN YÜKSEK skora göre sıralanıyor
    // (en alakalı doküman önce) — grup içi sıra ise chunkIndex'e göre.
    const orderedGroups = Array.from(groupedByDocument.values()).sort(
      (a, b) => Math.max(...b.map((m) => m.score)) - Math.max(...a.map((m) => m.score))
    );
    for (const group of orderedGroups) {
      group.sort((a, b) => a.chunk.chunkIndex - b.chunk.chunkIndex);
    }
    const orderedMatches = orderedGroups.flat();

    const ragContext = orderedMatches.length > 0
      ? orderedMatches.map((m, idx) => `[Referans ${idx + 1}]: ${m.chunk.content}`).join("\n\n")
      : "Eşleşen spesifik bir döküman bulunamadı.";

    const prompt = buildChatAssistantPrompt(ragContext, safeQuery, scopeLabel, webFallbackEnabled, context.plantKnowledgeContextText || undefined);

    const client = getGeminiClient();
    const response = await callGeminiWithRetry(() => {
      aiUsageTrackerService.recordUsage(config.ai.generationModel);
      return client.models.generateContent({
        model: config.ai.generationModel,
        contents: prompt,
        // Only requests live Google Search grounding — and its
        // associated latency/cost — when the document knowledge base
        // genuinely had nothing relevant to offer. A good RAG match
        // never triggers a web call (see PERFORMANS: gereksiz API
        // çağrısı yapma).
        config: webFallbackEnabled ? { tools: [{ googleSearch: {} }] } : undefined,
      });
    });

    // Sprint 2E — Kaynak Bilgisi: kullanılan chunk'lar, hangi
    // dokümandan/hangi başlıklardan geldiğine göre gruplanıp, her
    // dokümanın en yüksek skoruyla birlikte kullanıcıya gösterilecek
    // hale getiriliyor. RAG hiç kullanılmadıysa (webFallbackEnabled)
    // boş bir doküman listesiyle "Gemini" kaynağı bildiriliyor.
    let sources: RagSourceInfo;
    if (webFallbackEnabled) {
      sources = { sourceType: "Gemini", documents: [] };
    } else {
      const sourceDocuments: RagSourceDocument[] = [];
      for (const group of orderedGroups) {
        const doc = await uploadedDocumentRepository.getById(group[0].chunk.documentId);
        const headings = Array.from(new Set(group.map((m) => m.chunk.heading).filter((h): h is string => Boolean(h))));
        sourceDocuments.push({
          documentId: group[0].chunk.documentId,
          fileName: doc?.fileName ?? "(bilinmeyen doküman)",
          headings,
          score: Math.max(...group.map((m) => m.score)),
        });
      }
      sources = { sourceType: "RAG", documents: sourceDocuments };
    }

    return this.finalizeResult(
      response.text ? response.text.trim() : "Yapay zeka asistanından bir yanıt alınamadı.",
      webFallbackEnabled ? [] : orderedMatches.map((m) => m.chunk.content),
      sources,
      {
        intent,
        usedGemini: true,
        usedRetrieval: true,
        usedPlantKnowledge: !!context.plantKnowledgeContextText,
        usedFallback: isFallback,
        retrievalResultCount: initialMatches.length,
        retrievalScores: initialMatches.map((m) => m.score),
      }
    );
  }
}

export const chatAssistantService = new ChatAssistantService();
