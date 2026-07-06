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
import { searchSimilarChunks } from "./rag-retrieval.service";

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
 * Answers free-text agricultural questions using loaded RAG documentation.
 */
export class ChatAssistantService {
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
      const response = await callGeminiWithRetry(() => {
        aiUsageTrackerService.recordUsage(config.ai.generationModel);
        return client.models.generateContent({
          model: config.ai.generationModel,
          contents: prompt,
        });
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
}

export const chatAssistantService = new ChatAssistantService();
