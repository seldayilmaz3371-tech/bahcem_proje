/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { visionAnalysisResponseSchema, VisionAnalysisResponse } from "../../../prompts/vision-analysis.prompt";

/**
 * Sprint 7D — Vision Response Parser.
 *
 * "Gemini cevabı doğrudan kullanılmayacak, parser katmanı oluştur"
 * gereğini karşılar. Ham metni asla doğrudan çağırana döndürmez —
 * markdown temizliği + JSON ayrıştırma + Zod ile RUNTIME doğrulaması
 * (bir AI çıktısına asla doğrudan güvenilmez, bkz. GÜVENLİK) burada,
 * tek bir yerde yapılır.
 *
 * "İleride JSON şema doğrulaması eklenebilecek şekilde tasarla" gereği:
 * bu fonksiyon zaten Zod (`visionAnalysisResponseSchema`) kullanıyor —
 * şema ileride yeni alanlarla (örn. Sprint 7E'de etiket-özel alanlar)
 * genişletilebilir, parser'ın kendisi (ayrıştırma/temizleme mantığı)
 * hiç değişmeden kalır.
 *
 * `photo-analysis.service.ts`'teki eşdeğer mantığın (markdown temizleme,
 * JSON.parse, schema.parse) AYNI deseni burada AYRI bir katman olarak
 * tekrarlanıyor — kod kopyalanmadı, çünkü iki servisin şemaları farklı
 * (PhotoAiAnalysis vs. genel VisionAnalysisResponse); ortak bir yardımcı
 * fonksiyona çıkarmak bu sprintin kapsamı dışında bir refactor olurdu.
 */
export class VisionResponseParseError extends Error {}

/**
 * Gemini'den (veya ileride başka bir sağlayıcıdan) gelen ham metni
 * ayrıştırır ve doğrular. Başarısız olursa (bozuk JSON, şema dışı yanıt)
 * `VisionResponseParseError` fırlatır — çağıran (`VisionService`) bunu
 * kendi hata yönetimi akışında ele alır.
 */
export function parseVisionResponse(rawText: string): VisionAnalysisResponse {
  const cleanedText = rawText.replace(/^```json\s*|```\s*$/g, "").trim();

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(cleanedText);
  } catch {
    throw new VisionResponseParseError("Vision sağlayıcısının yanıtı geçerli bir JSON değil.");
  }

  const result = visionAnalysisResponseSchema.safeParse(rawParsed);
  if (!result.success) {
    // Not: şemadaki her alan zaten kendi `.catch()` kuralına sahip
    // (bkz. vision-analysis.prompt.ts), bu yüzden `safeParse` normalde
    // başarısız olmaz — bu dal yalnızca `rawParsed`'ın bir OBJE bile
    // olmadığı (örn. Gemini düz bir string/dizi döndürürse) uç durumu
    // için bir güvenlik ağıdır.
    throw new VisionResponseParseError("Vision sağlayıcısının yanıtı beklenen şemayla eşleşmiyor.");
  }
  return result.data;
}
