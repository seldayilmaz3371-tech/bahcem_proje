/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 5G — Evaluator Descriptors.
 *
 * TEMEL PRENSİP: Bu dosya, `Evaluator.name` (İngilizce sınıf adı, örn.
 * "DosageEvaluator") ile kullanıcıya gösterilecek bilgiler ARASINDAKİ
 * eşleşmeyi TEK bir yerde toplar — "Evaluator Framework değiştirilmedi"
 * (Sprint 5G kısıtı), bu tamamen AYRI, izole bir açıklama katmanı.
 *
 * GENİŞLETİLEBİLİRLİK: `EvaluatorDescriptor`, bugün yalnızca
 * `displayName` ve `category` kullanılsa bile, gelecekte `description`/
 * `icon`/`priority` gibi alanları KOD DEĞİŞİKLİĞİ GEREKTİRMEDEN
 * taşıyabilecek şekilde tasarlandı. Yeni bir Evaluator eklendiğinde,
 * yalnızca bu listeye bir kayıt eklenmesi yeterlidir — DecisionExplanationBuilder'ın
 * KENDİSİ değişmez.
 */

/** Şablon seçiminde de kullanılan kategori kümesi — talep edilen 7 şablonla birebir eşleşir. */
export type EvaluatorCategory = "İlaçlama" | "Gübreleme" | "Sulama" | "Budama" | "Genel Bakım" | "Risk";

export interface EvaluatorDescriptor {
  /** Evaluator.name ile BİREBİR eşleşmeli (örn. "DosageEvaluator"). */
  name: string;
  displayName: string;
  category: EvaluatorCategory;
  /** Gelecekte kullanılmak üzere — bugün doldurulmasa da mimari buna hazır. */
  description?: string;
  icon?: string;
  priority?: number;
}

/**
 * Sprint 5E'de gerçek değerlendirme mantığı yazılan 8 Evaluator'ın
 * tümü burada listelidir. `PruningRule`/budama ile ilgili henüz
 * hiçbir Evaluator yok (önceki mimari raporda bilinçli olarak
 * kapsam dışı bırakılmıştı) — "Budama" kategorisi bu yüzden şu an
 * hiçbir descriptor tarafından kullanılmıyor, yalnızca gelecekteki
 * bir Evaluator için hazır bir kategori olarak tanımlı.
 */
export const EVALUATOR_DESCRIPTORS: EvaluatorDescriptor[] = [
  { name: "DosageEvaluator", displayName: "Doz Kontrolü", category: "İlaçlama" },
  { name: "CompatibilityEvaluator", displayName: "Karışabilirlik Kontrolü", category: "İlaçlama" },
  { name: "WeatherEvaluator", displayName: "Hava Koşulları Kontrolü", category: "Genel Bakım" },
  { name: "PhenologyEvaluator", displayName: "Gelişim Dönemi Kontrolü", category: "Genel Bakım" },
  { name: "NutritionEvaluator", displayName: "Besleme Kontrolü", category: "Gübreleme" },
  { name: "HistoryEvaluator", displayName: "Geçmiş Uygulama Kontrolü", category: "Genel Bakım" },
  { name: "RiskEvaluator", displayName: "Risk Değerlendirmesi", category: "Risk" },
  { name: "InventoryEvaluator", displayName: "Stok Kontrolü", category: "Genel Bakım" },
];

/** Bilinmeyen bir evaluator adı için (gelecekte yeni bir Evaluator eklenip listeye kayıt eklenmesi UNUTULURSA), sistemin çökmemesi için güvenli bir varsayılan. */
const FALLBACK_DESCRIPTOR: EvaluatorDescriptor = {
  name: "Unknown",
  displayName: "Diğer Kontroller",
  category: "Genel Bakım",
};

export function getEvaluatorDescriptor(evaluatorName: string): EvaluatorDescriptor {
  return EVALUATOR_DESCRIPTORS.find((d) => d.name === evaluatorName) ?? { ...FALLBACK_DESCRIPTOR, name: evaluatorName };
}
