/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";

/**
 * Runtime schema for Gemini's single-photo analysis JSON response (see
 * `buildPhotoAnalysisPrompt` below). Formally validates and coerces the
 * model's output instead of relying on a TypeScript type assertion
 * (`as {...}`), which only affects compile-time checking and provides no
 * protection against a malformed or unexpected runtime response — an AI
 * output must never be trusted without validation (see GÜVENLİK: "AI
 * çıktısına da doğrudan güvenme").
 *
 * Colocated with its prompt (not a separate schemas file) because the
 * schema and the prompt together define a single contract: what this
 * specific AI interaction is asked for, and what shape its answer must
 * take. Splitting them into different files would let one drift out of
 * sync with the other without a compiler error.
 */
export const photoAnalysisResponseSchema = z.object({
  growthStage: z
    .enum(["Fide", "Gelişim", "Çiçeklenme", "Meyve/Ürün", "Olgunlaşma", "Belirsiz"])
    .catch("Belirsiz"),
  healthScore: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .catch(null),
  diseaseIndication: z.string().trim().min(1).nullable().catch(null),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .catch(0),
});

/** Validated, type-safe shape of a photo analysis response. Matches PhotoAiAnalysis minus the fields this application computes itself (isUncertain, analyzedAt). */
export type PhotoAnalysisResponse = z.infer<typeof photoAnalysisResponseSchema>;

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

