/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../logger";
import { VisionProvider } from "./vision/vision.types";
import { UploadedImageFile } from "./vision/image-validation.util";
import { validateImageFile } from "./vision/image-validation.util";
import { buildLabelExtractionPrompt, StructuredLabelExtraction } from "../../prompts/label-extraction.prompt";
import { parseLabelExtractionResponse, LabelExtractionParseError } from "./label-extraction.parser";
import { geminiVisionAdapter } from "./vision/gemini-vision.adapter";

/**
 * Sprint 7G — "OCR ayrıştırması ayrı servis olacaktır" gereğini
 * karşılayan, `VisionService`'ten (Sprint 7D) TAMAMEN BAĞIMSIZ bir
 * servis. `VisionService`'in KENDİSİ hiç değiştirilmedi, hiç import
 * edilmedi — yalnızca AYNI `VisionProvider` arayüzü ve AYNI
 * `geminiVisionAdapter` implementasyonu (Sprint 7D) constructor
 * injection ile YENİDEN KULLANILIYOR ("Vision servisi mümkün olduğunca
 * korunacaktır").
 *
 * Image validation da Sprint 7D'nin `image-validation.util.ts`'i
 * DEĞİŞTİRİLMEDEN yeniden kullanılıyor — aynı format/boyut/boşluk
 * kuralları burada da geçerli.
 */
export type LabelExtractionOutcome =
  | { success: true; result: StructuredLabelExtraction }
  | { success: false; errorMessage: string };

export class LabelExtractionService {
  constructor(private readonly provider: VisionProvider) {}

  /**
   * Bir ürün fotoğrafından yapılandırılmış etiket bilgisi çıkarmaya
   * çalışır. Asla throw etmez — sağlayıcı hatası, ayrıştırma hatası
   * veya geçersiz dosya durumunda `{success:false}` döner. Boş/düşük
   * bilgili bir yanıt (Gemini hiçbir alan bulamadıysa) HATA DEĞİLDİR —
   * `{success:true, result:{}}` olarak döner (bkz. Sprint 7G "OCR her
   * alanı bulmak zorunda değildir").
   */
  public async extractLabel(file: UploadedImageFile | null | undefined): Promise<LabelExtractionOutcome> {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return { success: false, errorMessage: validation.errorMessage! };
    }

    const prompt = buildLabelExtractionPrompt();
    const base64Data = file!.buffer.toString("base64");

    let rawText: string;
    try {
      rawText = await this.provider.analyzeImage(prompt, { base64Data, mimeType: file!.mimetype });
    } catch (error) {
      logger.error("AI", "Etiket ayrıştırma sağlayıcı çağrısı başarısız oldu.", error);
      return { success: false, errorMessage: "Etiket bilgisi şu anda okunamadı." };
    }

    try {
      const result = parseLabelExtractionResponse(rawText);
      return { success: true, result };
    } catch (error) {
      const isParseError = error instanceof LabelExtractionParseError;
      logger.error("AI", "Etiket ayrıştırma yanıtı işlenemedi.", error);
      return { success: false, errorMessage: isParseError ? error.message : "Etiket bilgisi işlenemedi." };
    }
  }
}

/** Sprint 7D'nin Gemini adaptörüyle önceden bağlanmış varsayılan örnek — yeni bir Gemini entegrasyonu değil. */
export const labelExtractionService = new LabelExtractionService(geminiVisionAdapter);
