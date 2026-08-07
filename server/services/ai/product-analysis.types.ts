/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StructuredLabelExtraction } from "../../prompts/label-extraction.prompt";

/**
 * Sprint 7E — AI Vision → Product Analysis akışı.
 *
 * `ProductAnalysisResult`, Vision analizinin sonucunu temsil eden GEÇİCİ
 * bir yanıt şeklidir (DTO) — **bir Product Bank entity'si DEĞİLDİR**.
 * `id`, `createdAt`, `inventoryItemId` gibi hiçbir kalıcılık alanı
 * taşımaz; hiçbir repository bu tipi okumaz/yazmaz. Yalnızca
 * kullanıcıya "az önce analiz ettiğin fotoğrafta bunlar var" bilgisini
 * göstermek için, tek bir HTTP isteği-yanıtı ömrü boyunca var olur.
 *
 * `brand`/`npkRatio`/`activeIngredient` gibi alanlar KASITLI OLARAK YOK
 * — Sprint 7E'nin kapsamı bunları ("Etiket ayrıştırma") açıkça dışarıda
 * bırakıyor.
 *
 * Sprint 7G güncellemesi: `structuredExtraction` alanı EKLENDİ (katkısal,
 * geriye dönük uyumlu — mevcut alanların hiçbiri kaldırılmadı/değiştirilmedi,
 * bkz. Sprint 7G "Çıktı Modeli" gereği).
 */
export interface ProductAnalysisResult {
  /** Vision'ın fotoğrafta gördüklerinin genel, serbest-metin açıklaması. */
  description: string;
  /** 0-1 arası güven skoru (mevcut LOW_CONFIDENCE_THRESHOLD ile aynı ölçek). */
  confidence: number;
  /**
   * Henüz doldurulmuyor (her zaman boş dizi) — mevcut Vision altyapısı
   * (Sprint 7D) nesne/varlık tespiti üretmiyor, yalnızca serbest metin
   * açıklama üretiyor. Alan, gelecekteki bir OCR/etiket ayrıştırma
   * sprintinin bu DTO'yu genişletmeden, mevcut şemaya dolduracağı bir
   * yer tutucu olarak kasıtlı şekilde burada duruyor.
   */
  detectedObjects: string[];
  /**
   * Kullanıcıya gösterilecek, sonuçla ilgili uyarılar (örn. düşük güven).
   * Bu, YENİ bir AI karar kuralı DEĞİLDİR — yalnızca mevcut `confidence`
   * değerinin, mevcut `LOW_CONFIDENCE_THRESHOLD` eşiğine göre insan-okur
   * bir metne çevrilmesidir (bkz. product-analysis.service.ts).
   */
  warnings: string[];
  /**
   * Ayrıştırılmış sonucun ham JSON temsili — VisionService'in mevcut
   * sözleşmesi (yalnızca ayrıştırılmış `{description, confidence}`
   * döndürür) DEĞİŞTİRİLMEDİĞİ için Gemini'nin GERÇEK ham metnine bu
   * DTO seviyesinden erişilemiyor. Bu bilinçli bir sınırlamadır — bkz.
   * Sprint Sonu Raporu, Risk Analizi.
   */
  rawResponse: string;
  /**
   * Sprint 7G — etiket üzerinden okunabilen yapılandırılmış alanlar
   * (varsa). Fotoğraf bir etiket değilse, hiçbir alan okunamadıysa, veya
   * etiket ayrıştırma servisi başarısız olduysa `undefined` kalır —
   * kullanıcı deneyimi hiç etkilenmez, form boş alanlarla açılır (bkz.
   * ProductAnalysisScreen.tsx).
   */
  structuredExtraction?: StructuredLabelExtraction;
}

