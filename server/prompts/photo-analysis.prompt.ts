/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds the prompt for a one-time, single-photo structured analysis.
 * Explicitly instructs Gemini to return ONLY a JSON object matching
 * PhotoAiAnalysis's shape (see models.ts) — no narrative text — and to
 * disclose low confidence honestly rather than guess, per this
 * project's CONFIDENCE principle. Deliberately does not ask for
 * fabricated-precision measurements (exact height, exact leaf count)
 * that a vision model cannot reliably determine from a single 2D image.
 * @param cropType The parcel's crop type, for context (e.g. "Zeytin")
 */
export function buildPhotoAnalysisPrompt(cropType: string): string {
  return `
Sen bir tarımsal görüntü analiz uzmanısın. Sana gösterilen TEK bir bitki/ağaç fotoğrafını analiz et (ürün türü: ${cropType}).

SADECE aşağıdaki JSON şemasına uyan, başka hiçbir metin içermeyen bir JSON nesnesi döndür:

{
  "growthStage": "Fide" | "Gelişim" | "Çiçeklenme" | "Meyve/Ürün" | "Olgunlaşma" | "Belirsiz",
  "healthScore": <0-100 arası bir tam sayı, veya net değerlendiremiyorsan null>,
  "diseaseIndication": "<gördüğün belirtinin kısa açıklaması>" veya null (belirti yoksa),
  "confidence": <0.0-1.0 arası, bu analize ne kadar güvendiğini gösteren ondalıklı sayı>
}

KURALLAR:
1. Fotoğraf net değilse, açı yetersizse veya emin değilsen "confidence" değerini düşük tut (0.5 altı) ve "healthScore" için null döndürmekten çekinme. TAHMİN YÜRÜTME.
2. Kesin sayısal ölçüm (boy, yaprak sayısı gibi) İSTEME veya ÜRETME — bunlar tek bir fotoğraftan güvenilir şekilde belirlenemez.
3. Sadece fotoğrafta gerçekten görebildiğin şeyleri değerlendir.
4. Yanıtın SADECE JSON olmalı — açıklama, markdown işaretleyici (\`\`\`json gibi) veya başka metin EKLEME.
`.trim();
}
