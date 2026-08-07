/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { config } from "../../../config";
import { aiUsageTrackerService } from "../../ai-usage-tracker.service";
import { getGeminiClient, callGeminiWithRetry } from "../gemini-client";
import { VisionProvider, VisionImageInput } from "./vision.types";

/**
 * Sprint 7D — Gemini implementasyonu, mevcut `gemini-client.ts`
 * (`getGeminiClient`/`callGeminiWithRetry`) ve `photo-analysis.service.ts`
 * ile BİREBİR aynı çağrı desenini kullanır — yeni bir Gemini entegrasyon
 * yöntemi icat edilmedi, yalnızca mevcut, kanıtlanmış deseni bu yeni
 * `VisionProvider` sözleşmesinin arkasına taşıyor.
 */
export class GeminiVisionAdapter implements VisionProvider {
  public async analyzeImage(prompt: string, image: VisionImageInput): Promise<string> {
    const client = getGeminiClient();
    const response = await callGeminiWithRetry(() => {
      aiUsageTrackerService.recordUsage(config.ai.generationModel);
      return client.models.generateContent({
        model: config.ai.generationModel,
        contents: [
          { text: prompt },
          { inlineData: { data: image.base64Data, mimeType: image.mimeType } },
        ],
      });
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      throw new Error("Gemini boş bir yanıt döndürdü.");
    }
    return rawText;
  }
}

export const geminiVisionAdapter = new GeminiVisionAdapter();
