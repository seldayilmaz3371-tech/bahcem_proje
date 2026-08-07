/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7F — Kullanıcının "Product Bank'e Kaydet" adımında onayladığı,
 * NİHAİ veriyi temsil eder. `ProductAnalysisResult`'tan (Sprint 7E)
 * FARKLIDIR: bu, AI'ın önerdiği bir taslak değil, kullanıcının
 * doldurduğu/düzelttiği son hâldir.
 *
 * BİLİNÇLİ TASARIM KARARI (bkz. onay mesajı "Değerlendirme 2"): Bu DTO
 * `{aiSuggested, userConfirmed}` gibi iki parçaya AYRILMADI — çünkü
 * Sprint 7E'nin `ProductAnalysisResult`'ı zaten hiçbir ürün alanı
 * (brand/activeIngredient/npkRatio) ÖNERMİYOR (OCR/etiket ayrıştırma
 * kapsam dışı) — yani "AI önerdi, kullanıcı düzeltti" diye ayrılacak bir
 * veri yok, kullanıcı bu alanları sıfırdan dolduruyor. İki parçalı bir
 * yapı, henüz var olmayan bir yeteneği (gelecekteki OCR sprinti)
 * bugünden karmaşıklaştırırdı.
 *
 * Şema, kasıtlı olarak Sprint 7C'nin mevcut `POST /api/products` body
 * şeklini birebir yansıtıyor — yeni bir alan kümesi icat edilmedi.
 */
export interface ProductCreateRequest {
  type: "Fertilizer" | "Chemical";
  name: string;
  brand?: string;
  unit: string;

  // Fertilizer'a özgü (type === "Fertilizer" ise anlamlı)
  npkRatio?: string;
  organicContentPercent?: number;
  microElements?: string;

  // Chemical'a özgü (type === "Chemical" ise anlamlı, activeIngredient zorunlu)
  activeIngredient?: string;
  concentration?: string;
  targetPests?: string[];
  preHarvestIntervalDays?: number;

  /**
   * Bu kaydın kökeninde bir AI analizi varsa (yani `/api/products/from-analysis`
   * üzerinden, bir `ProductAnalysisResult`'tan sonra geldiyse), o analizin
   * güven skoru — SADECE İZLENEBİLİRLİK amaçlı (Freeze §5, "İzlenebilirlik").
   * Mevcut, Sprint 7A'da eklenmiş ama şimdiye dek hiç kullanılmamış
   * `Fertilizer/Chemical.aiExtractedLabel`/`userConfirmed` alanlarını
   * doldurmak için kullanılır — YENİ bir şema alanı DEĞİL, mevcut
   * alanların ilk kez anlamlı kullanımı. Opsiyonel: tamamen manuel giriş
   * (Sprint 7C'nin orijinal `/api/products` akışı) için `undefined` kalır.
   */
  sourceAnalysisConfidence?: number;
}
