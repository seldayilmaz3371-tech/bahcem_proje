/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildSafeUserQuerySection } from "./prompt-safety.util";

/**
 * Builds the prompt for a photo-based growth analysis. Unlike earlier
 * versions of this feature, this prompt is entirely text-based: it never
 * includes raw photo images. Each photo's visual content is analyzed
 * exactly once, elsewhere (see AIService.analyzePhotoOnce), and the
 * resulting structured summary (growth stage, health score, disease
 * indication, confidence) is what this prompt synthesizes into a
 * narrative comparison. This is the mechanism that guarantees a given
 * photo is never re-sent to Gemini's vision model more than once, no
 * matter how many overlapping growth-analysis requests are made.
 * @param photoSummaries Pre-formatted, chronologically ordered text block of each photo's structured analysis
 * @param treeLabel When set (e.g. "T-101 (Gemlik) referans ağacı"), scopes
 *   the analysis language to a single tree instead of the whole parcel.
 *   Omit for the original parcel-wide behavior.
 */
export function buildGrowthAnalysisPrompt(
  parcelName: string,
  cropType: string,
  areaDekar: number,
  treeCount: number,
  rangeStartLabel: string,
  rangeEndLabel: string,
  photoSummaries: string,
  userQuery?: string,
  treeLabel?: string
): string {
  const plantLabel = cropType === "Zeytin" ? "ağaç" : "bitki";
  const userQuerySection = userQuery ? `\n${buildSafeUserQuerySection(userQuery)}\n` : "";
  const subjectDescription = treeLabel
    ? `"${parcelName}" parselindeki ${treeLabel}`
    : `"${parcelName}" adlı parsel (Ürün Türü: ${cropType}, ${areaDekar} Dekar, ${treeCount} adet ${plantLabel})`;
  const analysisScopeNote = treeLabel
    ? "Bu analiz yalnızca belirtilen tekil referans ağacına aittir; parselin geneli hakkında değildir."
    : "Bu analiz parselin geneline aittir.";

  return `
Sen Mersin Toroslar ve Değirmençay bölgesinde uzmanlaşmış bir Tarım Danışmanısın (Mersin Tarım Asistanı).
${subjectDescription} için, ${rangeStartLabel} ile ${rangeEndLabel} arasındaki gelişimi değerlendireceksin. ${analysisScopeNote}

=== ZAMAN SIRALI FOTOĞRAF ANALİZLERİ (KAYNAK: AI Analizi - Her Fotoğraf İçin Tek Seferlik Yapılandırılmış Kayıt) ===
${photoSummaries}

Yukarıdaki yapılandırılmış kayıtları zaman sırasına göre inceleyerek gelişimi analiz et:
1. **Görsel Değişim Özeti**: Sağlık skoru, büyüme evresi ve hastalık göstergelerindeki değişimi tarih sırasıyla anlat.
2. **Sağlık Değerlendirmesi**: Hastalık, zararlı veya besin eksikliği belirtisi varsa vurgula.
3. **Gelişim Hızı Yorumu**: Bu süre zarfında gelişimin normal, yavaş veya hızlı olduğuna dair bölgesel (Toroslar mikro-klimasına uygun) bir değerlendirme yap.
4. **Öneri**: Gözlemlerine dayanarak somut bir sonraki adım öner.
5. **Belirsizlik**: Kayıtlarda "belirsiz" işaretli bir analiz varsa, bunu ve bu analize dayanan yorumların da belirsiz olduğunu açıkça belirt.
${userQuerySection}
Cevabını Markdown formatında, net başlıklarla ve profesyonel/samimi bir Türkçe tonuyla yaz. Yalnızca yukarıdaki kayıtlara dayan; kayıtlarda olmayan hiçbir görsel detayı varsayma.
`.trim();
}
