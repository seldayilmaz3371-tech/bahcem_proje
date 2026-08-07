/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONFIDENCE_WEIGHTS } from "./confidence.service";
import { groupMatchesByDocument } from "./rag-retrieval.service";
import { VectorChunk } from "../../models";

/**
 * Sprint 9.10 — Kanıt Değerlendirme (Evidence Evaluation) katmanı.
 *
 * Hedef mimari: "Gemini bilgi üreten ana sistem OLMAYACAK — RAG/Yerel
 * Veri/Decision Engine/Open-Meteo tarafından sağlanan kanıtları
 * YORUMLAYAN bir analiz katmanı olacak." Bunun GERÇEKTEN sağlanabilmesi
 * için, "sorunun cevabı belgelerde ne kadar var?" sorusunun cevabı
 * Gemini'nin KENDİ ÖZ-BEYANINA (Sprint 9.1 denetiminde tespit edilen,
 * güvenilmez "Kaynak Beyanı" deseni) BIRAKILAMAZ — bu fonksiyon,
 * Gemini'ye HİÇ SORULMADAN, TAMAMEN DETERMİNİSTİK, MEVCUT
 * `confidence.service.ts`'in ZATEN KULLANDIĞI eşiklerle (yeni bir
 * sabit İCAT EDİLMEDİ) kanıt kapsamını belirler.
 *
 * Bu katman, pipeline'da Gemini'den ÖNCE çalışır (bkz. hedef sıralama:
 * Yerel Veri → RAG → Decision Engine → Open-Meteo → Kanıt Değerlendirme
 * → Gemini) — `parcel-recommendation.service.ts`'de, prompt
 * oluşturulmadan hemen önce çağrılır.
 *
 * Sprint 9.11 — "Evidence Architecture v2" düzeltmesi (kod ve gerçek
 * hesaplamayla kanıtlandı): ÖNCEKİ sürüm, TÜM adaylar arasından
 * yalnızca EN YÜKSEK TEK SKORA (`Math.max(...ragMatches.map(m=>m.score))`)
 * bakıyordu — bu, "Ürün Özeti" gibi TEK bir belge yüksek skor alsa
 * bile, "Garanti Edilen İçerik"/"Gübreleme Önerileri" gibi DİĞER,
 * SORUYLA İLGİLİ belgeler yalnızca ORTA düzeyde eşleşse dahi, genel
 * kapsamın YANLIŞLIKLA "full" (tamamen var) olarak hesaplanmasına yol
 * açabiliyordu. Artık kapsam BELGE BAZLI hesaplanıyor: her belge, KENDİ
 * en iyi chunk'ıyla temsil edilir (`groupMatchesByDocument` — Sprint
 * 9.1'den beri var olan, PAYLAŞILAN fonksiyon, YENİDEN YAZILMADI),
 * genel (overall) kapsam ise EN ZAYIF belgenin kapsamına eşittir
 * (muhafazakâr/en güvenli seçim — bkz. Sprint Sonu Raporu, Alternatif
 * Değerlendirmesi).
 */
export type DocumentCoverage = "full" | "partial" | "none";

export interface PerDocumentCoverage {
  documentId: string;
  topScore: number;
  coverage: DocumentCoverage;
}

export interface CoverageEvaluationResult {
  /** Sprint 9.10'un eski, tek-string sözleşmesiyle GERİYE DÖNÜK UYUMLU — mevcut STRICT_RAG/HYBRID dallanması bu alanı kullanmaya devam edebilir. */
  overall: DocumentCoverage;
  /** Sprint 9.11 — YENİ: her belgenin KENDİ kapsamı, ayrı ayrı. */
  perDocument: PerDocumentCoverage[];
}

function classifyScore(score: number): DocumentCoverage {
  if (score >= CONFIDENCE_WEIGHTS.STRONG_RETRIEVAL_MATCH_SCORE_THRESHOLD) return "full";
  if (score >= CONFIDENCE_WEIGHTS.MODERATE_RETRIEVAL_MATCH_SCORE_THRESHOLD) return "partial";
  return "none";
}

const COVERAGE_RANK: Record<DocumentCoverage, number> = { none: 0, partial: 1, full: 2 };

/**
 * `ragMatches` (context-builder.service.ts'in ZATEN hesapladığı, skorlu
 * chunk listesi) üzerinden, HER BELGEYİ kendi en iyi chunk'ıyla temsil
 * ederek, belge bazlı kanıt kapsamını hesaplar.
 *
 * `overall`, EN ZAYIF belgenin kapsamına eşittir — bu MUHAFAZAKÂR bir
 * seçimdir (bkz. Sprint Sonu Raporu): "bir belge güçlü, diğerleri zayıf"
 * durumunda, sistem YANLIŞLIKLA "tüm sorunun cevabı belgelerde var"
 * demek yerine, EKSİK kalan belgeleri de dikkate alarak "kısmen var"
 * demeyi tercih eder — projenin "kesin olmayan bilgiyi kesinmiş gibi
 * sunma" ilkesiyle tutarlıdır.
 */
export function evaluateDocumentCoverage(
  ragMatches: { chunk: VectorChunk; score: number }[]
): CoverageEvaluationResult {
  if (ragMatches.length === 0) return { overall: "none", perDocument: [] };

  const groups = groupMatchesByDocument(ragMatches);
  const perDocument: PerDocumentCoverage[] = groups.map((group) => {
    const topScore = Math.max(...group.map((m) => m.score));
    return { documentId: group[0].chunk.documentId, topScore, coverage: classifyScore(topScore) };
  });

  const overall = perDocument.reduce<DocumentCoverage>(
    (worst, d) => (COVERAGE_RANK[d.coverage] < COVERAGE_RANK[worst] ? d.coverage : worst),
    "full"
  );

  return { overall, perDocument };
}
