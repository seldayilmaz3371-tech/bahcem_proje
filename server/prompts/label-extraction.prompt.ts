/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";

/**
 * Sprint 7G — Label Extraction Prompt Builder.
 *
 * Bu, Sprint 7D'nin `vision-analysis.prompt.ts`'inden BİLİNÇLİ OLARAK
 * AYRI bir dosyadır — "OCR ayrıştırması ayrı servis olacaktır" ve
 * "Vision servisi mümkün olduğunca korunacaktır" gereklerine sadık
 * kalmak için `vision-analysis.prompt.ts`'e TEK SATIR dokunulmadı.
 *
 * Bu, yeni bir OCR TEKNOLOJİSİ (örn. Tesseract) DEĞİLDİR — Architecture
 * Freeze §8'in zaten seçtiği "Sadece Vision Modeli" kararının doğal bir
 * genişlemesidir: aynı Gemini multimodal modeli, bu kez daha
 * yapılandırılmış bir prompt ile çağrılıyor. Yeni bir bağımlılık
 * EKLENMEDİ.
 *
 * GÜVENLİK/KALİTE KURALI (Sprint 7G "OCR Kalite Kuralları"): Her alan
 * OPSİYONEL — Gemini'den, emin olmadığı alanları TAHMİN ETMEDEN, ATLAMASI
 * isteniyor (`.optional()`, `.catch(undefined)` deseni ile). Bu, projenin
 * genel "AI hiçbir zaman kesin olmayan bilgiyi kesinmiş gibi sunmamalı"
 * ilkesinin buradaki karşılığıdır.
 */

const optionalField = () => z.string().trim().min(1).optional().catch(undefined);

export const structuredLabelExtractionSchema = z.object({
  productName: optionalField(),
  brand: optionalField(),
  categorySuggestion: z.enum(["Fertilizer", "Chemical"]).optional().catch(undefined),
  npkRatio: optionalField(),
  activeIngredient: optionalField(),
  concentration: optionalField(),
  formulation: optionalField(),
  packageSize: optionalField(),
  manufacturer: optionalField(),
  importantWarnings: z.array(z.string().trim().min(1)).optional().catch(undefined),
});

export type StructuredLabelExtraction = z.infer<typeof structuredLabelExtractionSchema>;

/**
 * Etiket üzerindeki yapılandırılmış bilgiyi okumaya çalışan promptu
 * üretir. Sprint 7D'nin genel `buildVisionAnalysisPrompt()`'undan AYRI,
 * BAĞIMSIZ bir Gemini çağrısı için kullanılır (bkz. label-extraction.service.ts).
 */
export function buildLabelExtractionPrompt(): string {
  return `
Sana gösterilen fotoğraf bir tarım ürünü (gübre veya zirai ilaç) etiketi
olabilir. Etiket üzerinde GERÇEKTEN OKUYABİLDİĞİN bilgileri çıkar.

SADECE aşağıdaki JSON şemasına uyan, başka hiçbir metin içermeyen bir JSON nesnesi döndür:

{
  "productName": "<ürünün ticari adı, okuyabiliyorsan>",
  "brand": "<marka adı, okuyabiliyorsan>",
  "categorySuggestion": "<'Fertilizer' (gübre) veya 'Chemical' (zirai ilaç) — yalnızca eminsen>",
  "npkRatio": "<gübre ise NPK oranı, örn. '15-15-15', okuyabiliyorsan>",
  "activeIngredient": "<zirai ilaç ise etken madde adı, okuyabiliyorsan>",
  "concentration": "<etken madde konsantrasyonu, örn. '%25', okuyabiliyorsan>",
  "formulation": "<formülasyon tipi, örn. 'WP', 'EC', 'SC', okuyabiliyorsan>",
  "packageSize": "<net ağırlık veya hacim, örn. '1 Litre', '25 Kg', okuyabiliyorsan>",
  "manufacturer": "<üretici firma adı, okuyabiliyorsan>",
  "importantWarnings": ["<etiket üzerindeki önemli uyarı metinleri, varsa>"]
}

KESİN KURALLAR:
1. Bir alanı NET OLARAK OKUYAMIYORSAN, o alanı JSON'dan TAMAMEN ÇIKAR (boş string veya tahmin YAZMA).
2. ASLA TAHMİN YÜRÜTME veya UYDURMA VERİ ÜRETME. Etikette gerçekten yazmayan bir bilgiyi ASLA yazma.
3. "categorySuggestion" yalnızca etikette AÇIKÇA "gübre"/"ilaç" gibi bir ibare görüyorsan veya bağlamdan KESİN eminsen doldurulmalı — belirsizse bu alanı da çıkar.
4. Fotoğraf bir ürün etiketi DEĞİLSE (örn. bir bitki/ağaç fotoğrafıysa), TÜM alanları boş bırak — JSON'da hiçbir alan olmasın (yalnızca boş bir obje: {}).
5. Yanıtın SADECE JSON olmalı — açıklama, markdown işaretleyici veya başka metin EKLEME.
`.trim();
}
