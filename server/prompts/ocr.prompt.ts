/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 9.6 — OCR (metin transkripsiyonu) prompt'u.
 *
 * `label-extraction.prompt.ts`'ten (Sprint 7G) BİLİNÇLİ OLARAK AYRI —
 * o prompt YAPILANDIRILMIŞ ALANLAR (marka/NPK/vb.) istiyordu, bu prompt
 * GÖRÜNTÜDEKİ TÜM METNİ, OLDUĞU GİBİ, HARFİYEN transkribe etmesini
 * istiyor (klasik OCR davranışı). Yeni bir Gemini entegrasyonu DEĞİL —
 * `geminiVisionAdapter`'ı (Sprint 7D) AYNEN kullanır, yalnızca farklı
 * bir prompt metni ile.
 */
export function buildOcrPrompt(): string {
  return `
Bu bir tarım ürünü etiketi, belgesi veya tablosu olabilir. Görüntüdeki TÜM metni, GÖRÜLDÜĞÜ GİBİ, harfiyen transkribe et.

KESİN KURALLAR:
1. Görüntüde GERÇEKTEN yazan metni aktar — YORUM YAPMA, ÖZETLEME, YENİDEN İFADE ETME.
2. Tablo varsa, satır/sütun yapısını mümkün olduğunca koru (her satırı ayrı bir satırda, değerleri ayıraç veya boşlukla).
3. Görüntüde HİÇ metin yoksa (yalnızca logo/görsel), boş bir yanıt döndür.
4. Emin olmadığın bir karakter/rakamı ASLA UYDURMA — okunaksızsa o kısmı atla, tahmin etme.
5. Yanıtın SADECE transkribe edilen metin olmalı — açıklama, markdown işaretleyici veya yorum EKLEME.
`.trim();
}
