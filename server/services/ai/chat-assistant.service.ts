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
  public async queryChatAssistant(userQuery: string, documentIds?: string[], scopeLabel?: string): Promise<{ text: string; usedChunks: string[] }> {
    const safeQuery = capUserQueryLength(userQuery);

    if (isTrivialGreeting(safeQuery)) {
      return {
        text: "Merhaba! Ben Mersin AgriTech RAG asistanınızım. Zeytin tarımı, hastalık teşhisi veya yüklediğiniz dokümanlarla ilgili bir soru sorabilirsiniz.",
        usedChunks: [],
      };
    }

    if (documentIds && documentIds.length === 0) {
      return {
        text: "Bu ekipman için henüz bir kullanım kılavuzu yüklenmemiş. Sağlıklı bir arıza tavsiyesi verebilmem için lütfen önce ekipmanın kullanım kılavuzunu (PDF/DOCX/TXT) yükleyin.",
        usedChunks: [],
      };
    }

    try {
      // Sprint 2D — Aşama 3: metadataBoostQuery parametresi eklenerek
      // heading/topics/keywords/cropType eşleşmesi de sıralamaya dahil
      // ediliyor (geriye dönük uyumlu — parcel-recommendation.service.ts
      // bu parametreyi hiç geçmediği için etkilenmiyor).
      const initialMatches = await searchSimilarChunks(safeQuery, 3, documentIds, safeQuery);

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

      const prompt = buildChatAssistantPrompt(ragContext, safeQuery, scopeLabel, webFallbackEnabled);

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

      return {
        text: response.text ? response.text.trim() : "Yapay zeka asistanından bir yanıt alınamadı.",
        usedChunks: webFallbackEnabled ? [] : orderedMatches.map((m) => m.chunk.content),
      };
    } catch (error) {
      logger.error("AI", "Error inside general chat assistant query", error);
      throw error;
    }
  }
}

export const chatAssistantService = new ChatAssistantService();
