/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";

/**
 * Sprint 7D — Vision Prompt Builder.
 *
 * "Prompt metni route içinde yazılmayacak, tek merkezden üretilecek"
 * gereğini karşılar — mevcut `photo-analysis.prompt.ts` deseniyle aynı
 * yerleşim mantığı: şema ve prompt aynı dosyada, çünkü ikisi birlikte
 * TEK bir sözleşmeyi tanımlıyor (bkz. photo-analysis.prompt.ts'teki aynı
 * gerekçe).
 *
 * BİLİNÇLİ KAPSAM SINIRI (Sprint 7D): Bu prompt yalnızca GENEL bir görsel
 * analizi istiyor — etiket metni çıkarma, marka/etken madde/NPK gibi
 * yapılandırılmış ürün alanları KESİNLİKLE İSTENMİYOR (bkz. Sprint 7D
 * "Yapılmayacaklar": OCR, Etiket ayrıştırma). Bu, ileride (Sprint 7E+)
 * ürün etiketi ayrıştırmasının üzerine inşa edileceği ALTYAPI'dır, henüz
 * o özel iş mantığının kendisi değildir.
 */
export const visionAnalysisResponseSchema = z.object({
  description: z.string().trim().min(1).catch("Analiz tamamlanamadı."),
  confidence: z.number().min(0).max(1).catch(0),
});

/** Validated, type-safe shape of a general vision analysis response. */
export type VisionAnalysisResponse = z.infer<typeof visionAnalysisResponseSchema>;

/**
 * Genel amaçlı, tek-fotoğraflık bir vision analizi promptu üretir.
 * Gemini'den SADECE JSON istiyor, hiçbir OCR/etiket ayrıştırma
 * talimatı içermiyor — bu, Sprint 7D'nin kasıtlı kapsam sınırıdır.
 */
export function buildVisionAnalysisPrompt(): string {
  return `
Sana gösterilen fotoğrafı genel olarak değerlendir.

SADECE aşağıdaki JSON şemasına uyan, başka hiçbir metin içermeyen bir JSON nesnesi döndür:

{
  "description": "<fotoğrafta gördüklerinin kısa, tarafsız bir açıklaması>",
  "confidence": <0.0-1.0 arası, bu değerlendirmeye ne kadar güvendiğini gösteren ondalıklı sayı>
}

KURALLAR:
1. Fotoğraf net değilse, açı yetersizse veya emin değilsen "confidence" değerini düşük tut (0.5 altı). TAHMİN YÜRÜTME.
2. Yalnızca fotoğrafta gerçekten görebildiğin şeyleri betimle.
3. Metin okuma, etiket ayrıştırma veya ürün kimliği çıkarma DENEME — yalnızca genel görsel içeriği betimle.
4. Yanıtın SADECE JSON olmalı — açıklama, markdown işaretleyici (\`\`\`json gibi) veya başka metin EKLEME.
`.trim();
}
