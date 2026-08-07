/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StructuredLabelExtraction, ProductAnalysisResult } from "../types";
import { ProductCreateFormValues } from "./useProductCreateFromAnalysis";

/**
 * Sprint 7G — AI'ın etiketten okuduğu bilgiyi (varsa), "Düzenle" formunun
 * BAŞLANGIÇ değerlerine dönüştürür. Saf, React'ten bağımsız bir
 * fonksiyondur — bu projede bir React render-test altyapısı (RTL)
 * olmadığı için (bkz. useProductAnalysis.classify.test.ts'teki aynı
 * gerekçe), form ön-doldurma mantığının test edilebilir olması için
 * component'ten AYRIŞTIRILDI.
 *
 * ÖNEMLİ: Bu fonksiyon yalnızca form'un BAŞLANGIÇ durumunu belirler.
 * Kullanıcı, döndürülen HER alanı serbestçe değiştirebilir (Sprint 7G
 * "AI hiçbir alanı kilitlemeyecek" gereği) — form input'ları zaten
 * `updateField` ile düzenlenebilir durumda (bkz. ProductAnalysisScreen.tsx).
 * `categorySuggestion` de yalnızca bir ÖNERİ — kullanıcı "Gübre"/"Zirai
 * İlaç" butonlarından istediğini seçebilir.
 */
export function mapAnalysisToFormValues(result: ProductAnalysisResult | null): ProductCreateFormValues {
  const extraction: StructuredLabelExtraction | undefined = result?.structuredExtraction;

  return {
    // AI bir kategori önerdiyse onu başlangıç seçimi yap; önermediyse
    // güvenli bir varsayılan (Fertilizer) kullan — kullanıcı her durumda
    // değiştirebilir.
    type: extraction?.categorySuggestion ?? "Fertilizer",
    name: extraction?.productName ?? "",
    brand: extraction?.brand,
    // DİKKAT: `packageSize` ("25 Kg", "1 Litre" gibi paket boyutu) ile
    // `unit` ("Kg", "Litre" gibi salt ölçü birimi) KAVRAMSAL OLARAK
    // FARKLIDIR — birini diğerine otomatik yazmak yanlış veri girişine
    // yol açardı (örn. unit alanına yanlışlıkla "25 Kg" yazılması).
    // `unit` KASITLI OLARAK boş bırakılıyor; kullanıcı doldurur.
    // `packageSize`, formda yalnızca BİLGİ amaçlı (salt-görüntüleme)
    // gösterilir (bkz. ProductAnalysisScreen.tsx).
    unit: "",
    npkRatio: extraction?.npkRatio,
    activeIngredient: extraction?.activeIngredient,
    concentration: extraction?.concentration,
    sourceAnalysisConfidence: result?.confidence,
  };
}
