/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VectorChunk } from "../../models";

/**
 * Sprint 9.24 — Kritik Bölüm Garantisi.
 *
 * KÖK NEDEN (kod kanıtıyla doğrulandı): `expandWithDocumentContext()`
 * (rag-retrieval.service.ts:646), yalnızca EN İYİ eşleşmenin (ilk
 * chunk) belgesinden, `maxExtra=2` (en fazla 2) ek chunk getiriyor —
 * VE bu ek chunk'lar da yine `minExtraScore=0.5` embedding benzerlik
 * eşiğine tabi. `expandWithAdjacentChunks()` ise yalnızca ZATEN
 * seçilmiş chunk'ların HEMEN yanındaki (chunkIndex±1) chunk'ları
 * getiriyor. Sonuç: retrieval'in HİÇBİR aşaması, "Kullanma Şekli"/
 * "Doz"/"Uyarılar" gibi bölümleri, kullanıcının sorgusuyla embedding
 * benzerliği düşükse (örn. "tüm bilgileri listele" gibi genel bir
 * soru), GARANTİ EDEMİYOR.
 *
 * Bu modül, saf embedding benzerliğinden BAĞIMSIZ, ürünün TÜM
 * belgelerindeki chunk'lar arasından, kritik bölüm başlıklarına
 * (KANITA DAYALI liste — aşağıda kaynağı belirtiliyor) uyan
 * chunk'ları bulur — bu chunk'lar SONRA (product-document-qa.service.ts
 * içinde) mevcut retrieval sonucuna EKLENİR, mevcut similarity/
 * threshold/ranking mantığı hiç değiştirilmez.
 *
 * ANAHTAR KELİME LİSTESİNİN KAYNAĞI (tahmin edilmedi):
 * - "kullanma şekli", "kullanım dozu", "uygulama zamanı", "uygulama
 *   şekli", "depolama", "uyarı": kullanıcının GERÇEK debug
 *   incelemesinde bildirdiği, gerçekten var olan chunk başlıkları
 *   (Sprint 9.24 görev tanımı).
 * - "aktif madde", "konsantrasyon", "mikro element", "hedef zararlı",
 *   "hasat öncesi bekleme": `product-capture-session.service.ts`'teki
 *   `ProductCreateRequest` şemasının GERÇEK alanları (activeIngredient,
 *   concentration, microElements, targetPests, preHarvestIntervalDays).
 * - "garanti edilen içerik", "npk": önceki sprintlerde gerçek
 *   veritabanı incelemesinde (Sprint 9.17) doğrulanan, gerçekten var
 *   olan başlık/içerik.
 *
 * DÜRÜSTÇE BELİRTİLİYOR: Kullanıcının görev tanımında "örnek" olarak
 * verdiği "Karışabilirlik", "Ruhsat Bilgileri", "Koruyucu Donanım",
 * "İlk Yardım" gibi terimler, bu projede GERÇEKTEN var olduğu
 * KANITLANMAMIŞ terimlerdir — yine de kapsayıcılık için listeye dahil
 * edildi, ama bu, "kanıtlanmış" değil "kullanıcı tarafından önerilen"
 * bir genişletmedir.
 */
export const CRITICAL_SECTION_KEYWORDS: readonly string[] = [
  // Kanıtlanmış — kullanıcının gerçek debug incelemesinde bildirdiği başlıklar
  "kullanma şekli",
  "kullanım şekli",
  "kullanım dozu",
  "kullanma dozu",
  "uygulama zaman",
  "uygulama şekli",
  "depolama",
  "uyarı",
  // Kanıtlanmış — ProductCreateRequest şemasının gerçek alanları
  "aktif madde",
  "konsantrasyon",
  "mikro element",
  "hedef zararlı",
  "hasat öncesi bekleme",
  // Kanıtlanmış — Sprint 9.17'de gerçek veritabanında doğrulanan içerik
  "garanti edilen içerik",
  "npk",
  // Kullanıcı tarafından önerilen, bu projede KANITLANMAMIŞ genişletmeler
  "karışabilirlik",
  "güvenlik",
  "ilk yardım",
  "hasat süresi",
  "bekleme süresi",
  "koruyucu donanım",
  "ruhsat",
] as const;

/**
 * `chunks` içinden, `heading` alanında VEYA `content`'in ilk 200
 * karakterinde (heading her zaman dolu olmadığı için — Sprint 9.13'te
 * kanıtlanan, çoğu chunk'ta boş kalan alan) kritik anahtar
 * kelimelerden herhangi birini içerenleri döndürür. Saf, deterministik
 * fonksiyon — embedding/Gemini çağrısı yapmaz.
 */
export function findCriticalSectionChunks(
  chunks: VectorChunk[],
  keywords: readonly string[] = CRITICAL_SECTION_KEYWORDS
): VectorChunk[] {
  return chunks.filter((chunk) => {
    const searchableText = `${chunk.heading ?? ""} ${(chunk.content || "").slice(0, 200)}`.toLocaleLowerCase("tr-TR");
    return keywords.some((keyword) => searchableText.includes(keyword));
  });
}
