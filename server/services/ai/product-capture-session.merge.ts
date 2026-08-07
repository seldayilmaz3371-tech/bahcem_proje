/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StructuredLabelExtraction } from "../../prompts/label-extraction.prompt";

/**
 * Sprint 8 — Bilgi Birleştirme Algoritması.
 *
 * Aynı Product Capture Session'a ait BİRDEN FAZLA fotoğrafın (her biri
 * `LabelExtractionService` — DEĞİŞTİRİLMEDEN — ile AYRI AYRI analiz
 * edilmiş) çıktısını TEK bir `StructuredLabelExtraction`'a birleştirir.
 *
 * KURAL (Sprint 8 "Önemli Kural"): Bir fotoğrafta bir alan bulunamaması
 * hata değildir — aynı oturumdaki BAŞKA bir fotoğrafta o alan bulunduysa,
 * o değer kullanılır. Bu "ilişkilendirme" AI TAHMİNİYLE değil, saf bir
 * BİRLEŞTİRME KURALIYLA yapılır: her alan için, dosya sırasına göre
 * TARANAN fotoğraflar arasında İLK bulunan (undefined olmayan) değer
 * kullanılır — "yalnızca ilk fotoğrafta" ve "yalnızca son fotoğrafta"
 * senaryolarının HER İKİSİNİ de doğru ele alır (sıradan bağımsız,
 * tutarlı bir kural).
 *
 * `importantWarnings` (dizi alan) farklı ele alınır: TÜM fotoğraflardaki
 * uyarılar BİRLEŞTİRİLİR (union), tekrarlar elenir — bir güvenlik
 * uyarısı yalnızca BİR fotoğrafta okunabilse bile kullanıcıya
 * gösterilmesi gerekir, "ilk kazanır" kuralı burada YANLIŞ olurdu.
 *
 * Saf fonksiyon — `LabelExtractionService`'in kendisine hiç dokunmadan,
 * onun ÇIKTILARINI birleştirir.
 */
export function mergeStructuredExtractions(extractions: StructuredLabelExtraction[]): StructuredLabelExtraction {
  const scalarFields: (keyof StructuredLabelExtraction)[] = [
    "productName",
    "brand",
    "categorySuggestion",
    "npkRatio",
    "activeIngredient",
    "concentration",
    "formulation",
    "packageSize",
    "manufacturer",
  ];

  const merged: StructuredLabelExtraction = {};

  for (const field of scalarFields) {
    for (const extraction of extractions) {
      const value = extraction[field];
      if (value !== undefined) {
        (merged as any)[field] = value;
        break; // bu alan için ilk bulunan değer kazandı, sonraki fotoğraflara bakmaya gerek yok
      }
    }
  }

  const allWarnings = new Set<string>();
  for (const extraction of extractions) {
    for (const warning of extraction.importantWarnings ?? []) {
      allWarnings.add(warning);
    }
  }
  if (allWarnings.size > 0) {
    merged.importantWarnings = Array.from(allWarnings);
  }

  return merged;
}
