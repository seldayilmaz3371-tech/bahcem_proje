/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../../logger";
import { VisionProvider } from "./vision.types";
import { validateImageFile, UploadedImageFile } from "./image-validation.util";
import { buildVisionAnalysisPrompt, VisionAnalysisResponse } from "../../../prompts/vision-analysis.prompt";
import { parseVisionResponse, VisionResponseParseError } from "./vision-response.parser";
import { geminiVisionAdapter } from "./gemini-vision.adapter";

/**
 * Sprint 7D — Vision Service.
 *
 * Katmanlı mimarinin tek giriş noktası: Route → VisionService → Adapter
 * → Sağlayıcı. Route, hiçbir zaman `VisionProvider`'ı veya prompt/parser
 * fonksiyonlarını doğrudan çağırmaz — yalnızca bu servisi.
 *
 * Sağlayıcı, constructor injection ile alınır (mevcut Evaluator
 * Framework'teki desenle tutarlı — bkz. `BaseEvaluator` alt sınıflarının
 * repository'lerini constructor'da alması) — bu, testte gerçek Gemini
 * yerine sahte bir `VisionProvider` enjekte edilebilmesini sağlar, ağ
 * çağrısı gerektirmez.
 */
export type VisionAnalysisOutcome =
  | { success: true; result: VisionAnalysisResponse }
  | { success: false; errorMessage: string };

export class VisionService {
  constructor(private readonly provider: VisionProvider) {}

  /**
   * Bir görseli doğrular, sağlayıcıya gönderir, yanıtı ayrıştırıp
   * doğrular. Hiçbir veritabanı okuma/yazma işlemi yapmaz (bkz. Sprint
   * 7D kapsam sınırı — "henüz Product Bank'a kayıt yapmamalı"). Asla
   * throw etmez — her başarısızlık türü (geçersiz dosya, sağlayıcı
   * hatası, ayrıştırma hatası) `{ success: false, errorMessage }` olarak
   * döner, çağıran route bunu kendi HTTP durum koduna çevirir.
   */
  public async analyze(file: UploadedImageFile | null | undefined): Promise<VisionAnalysisOutcome> {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return { success: false, errorMessage: validation.errorMessage! };
    }

    const prompt = buildVisionAnalysisPrompt();
    const base64Data = file!.buffer.toString("base64");

    let rawText: string;
    try {
      rawText = await this.provider.analyzeImage(prompt, { base64Data, mimeType: file!.mimetype });
    } catch (error) {
      logger.error("AI", "Vision sağlayıcı çağrısı başarısız oldu.", error);
      return { success: false, errorMessage: "Fotoğraf analizi şu anda gerçekleştirilemedi. Lütfen daha sonra tekrar deneyin." };
    }

    try {
      const result = parseVisionResponse(rawText);
      return { success: true, result };
    } catch (error) {
      const isParseError = error instanceof VisionResponseParseError;
      logger.error("AI", "Vision yanıtı ayrıştırılamadı.", error);
      return {
        success: false,
        errorMessage: isParseError ? error.message : "Fotoğraf analiz sonucu işlenemedi.",
      };
    }
  }
}

/** Route katmanının doğrudan kullanacağı, Gemini adaptörüyle önceden bağlanmış varsayılan örnek. */
export const visionService = new VisionService(geminiVisionAdapter);
