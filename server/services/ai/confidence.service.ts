/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 4F — Confidence Model.
 *
 * TEMEL PRENSİP (Görev 10'dan): Bu servis yalnızca DEĞERLENDİRİR —
 * hiçbir cevabı değiştirmez, hiçbir karar VERMEZ. Girdi olarak mevcut
 * AI akışının ürettiği SİNYALLERİ alır, 0-100 arası deterministik bir
 * puan ve açıklanabilir sebepler üretir.
 *
 * TEK SORUMLULUK: Confidence hesaplama mantığı yalnızca burada yaşar —
 * `chat-assistant.service.ts` ve `parcel-recommendation.service.ts`
 * yalnızca SİNYALLERİ toplayıp bu servise verir, kendi içlerinde
 * hiçbir puanlama mantığı barındırmaz (bkz. Görev 7).
 *
 * GENİŞLETİLEBİLİRLİK (Görev 6): Kurallar `CONFIDENCE_RULES` dizisinde
 * tanımlıdır — yeni bir sinyal/kural eklemek, yalnızca bu diziye yeni
 * bir kayıt eklemeyi gerektirir; `calculate()` fonksiyonunun kendisine
 * hiçbir değişiklik gerekmez.
 */

export interface ConfidenceSignals {
  intent: string;
  usedGemini: boolean;
  usedRetrieval: boolean;
  usedPlantKnowledge: boolean;
  usedFallback: boolean;
  /** Retrieval'dan dönen chunk/kayıt sayısı (0 ise: retrieval denendi ama hiçbir eşleşme bulunamadı). */
  retrievalResultCount: number;
  /** Retrieval sonuçlarının ham benzerlik skorları (varsa) — en yükseği değerlendirmede kullanılır. */
  retrievalScores: number[];
}

export interface ConfidenceResult {
  /** 0-100 arası, deterministik güven puanı. */
  confidence: number;
  /** İnsan tarafından okunabilir, puanı açıklayan sebepler listesi. */
  reasons: string[];
}

/**
 * Merkezi ağırlık/eşik tanımları (Görev: "Magic number kullanma,
 * kurallar merkezi yapıda olsun"). Tüm puanlama sabitleri yalnızca
 * burada tanımlıdır.
 */
const CONFIDENCE_WEIGHTS = {
  BASE_SCORE: 50,
  STRONG_RETRIEVAL_MATCH_SCORE_THRESHOLD: 0.7,
  STRONG_RETRIEVAL_MATCH_POINTS: 20,
  MODERATE_RETRIEVAL_MATCH_SCORE_THRESHOLD: 0.55,
  MODERATE_RETRIEVAL_MATCH_POINTS: 10,
  PLANT_KNOWLEDGE_FOUND_POINTS: 15,
  MULTIPLE_SOURCES_AGREE_POINTS: 10,
  DIRECT_DATABASE_ANSWER_POINTS: 15,
  FALLBACK_PENALTY_POINTS: -25,
  NO_RETRIEVAL_RESULT_PENALTY_POINTS: -15,
  MIN_CONFIDENCE: 0,
  MAX_CONFIDENCE: 100,
} as const;

/** Yalnızca bu iki intent, doğrudan-veritabanı işlem hattını kullanır (bkz. Sprint 4E). */
const DIRECT_DATABASE_INTENTS = ["InventoryQuestion", "FinanceQuestion"];

interface ConfidenceRuleResult {
  points: number;
  reason: string;
}

interface ConfidenceRule {
  name: string;
  evaluate(signals: ConfidenceSignals): ConfidenceRuleResult | null;
}

const CONFIDENCE_RULES: ConfidenceRule[] = [
  {
    name: "retrieval-match-strength",
    evaluate: (s) => {
      if (s.retrievalScores.length === 0) return null;
      const topScore = Math.max(...s.retrievalScores);
      if (topScore >= CONFIDENCE_WEIGHTS.STRONG_RETRIEVAL_MATCH_SCORE_THRESHOLD) {
        return { points: CONFIDENCE_WEIGHTS.STRONG_RETRIEVAL_MATCH_POINTS, reason: "Güçlü Retrieval eşleşmesi" };
      }
      if (topScore >= CONFIDENCE_WEIGHTS.MODERATE_RETRIEVAL_MATCH_SCORE_THRESHOLD) {
        return { points: CONFIDENCE_WEIGHTS.MODERATE_RETRIEVAL_MATCH_POINTS, reason: "Orta düzey Retrieval eşleşmesi" };
      }
      return null;
    },
  },
  {
    name: "plant-knowledge-found",
    evaluate: (s) =>
      s.usedPlantKnowledge
        ? { points: CONFIDENCE_WEIGHTS.PLANT_KNOWLEDGE_FOUND_POINTS, reason: "Plant Knowledge (doğrulanmış bitki bilgisi) bulundu" }
        : null,
  },
  {
    name: "multiple-sources-agree",
    evaluate: (s) =>
      s.usedPlantKnowledge && s.retrievalResultCount > 0
        ? { points: CONFIDENCE_WEIGHTS.MULTIPLE_SOURCES_AGREE_POINTS, reason: "Aynı bilgi birden fazla kaynaktan (RAG + Plant Knowledge) destekleniyor" }
        : null,
  },
  {
    name: "direct-database-answer",
    evaluate: (s) =>
      !s.usedRetrieval && s.usedGemini && DIRECT_DATABASE_INTENTS.includes(s.intent)
        ? { points: CONFIDENCE_WEIGHTS.DIRECT_DATABASE_ANSWER_POINTS, reason: "Cevap doğrudan, gerçek veritabanı kayıtlarına dayanıyor" }
        : null,
  },
  {
    name: "fallback-used",
    evaluate: (s) =>
      s.usedFallback
        ? { points: CONFIDENCE_WEIGHTS.FALLBACK_PENALTY_POINTS, reason: "Birincil işlem hattı başarısız oldu, güvenli yedek akışa düşüldü" }
        : null,
  },
  {
    name: "no-retrieval-result",
    evaluate: (s) =>
      s.usedRetrieval && s.retrievalResultCount === 0
        ? { points: CONFIDENCE_WEIGHTS.NO_RETRIEVAL_RESULT_PENALTY_POINTS, reason: "İlgili kayıt bulunamadı, cevap büyük ölçüde genel AI bilgisine dayanıyor" }
        : null,
  },
];

export class ConfidenceService {
  /**
   * Sinyallerden 0-100 arası bir güven puanı ve açıklanabilir sebepler
   * üretir. Hiçbir kural tetiklenmezse (nötr durum), yalnızca temel
   * puan ve genel bir açıklama döner — bu bir HATA değildir.
   */
  public calculate(signals: ConfidenceSignals): ConfidenceResult {
    let score = CONFIDENCE_WEIGHTS.BASE_SCORE;
    const reasons: string[] = [];

    for (const rule of CONFIDENCE_RULES) {
      const result = rule.evaluate(signals);
      if (result) {
        score += result.points;
        reasons.push(result.reason);
      }
    }

    const confidence = Math.max(
      CONFIDENCE_WEIGHTS.MIN_CONFIDENCE,
      Math.min(CONFIDENCE_WEIGHTS.MAX_CONFIDENCE, Math.round(score))
    );

    if (reasons.length === 0) {
      reasons.push("Standart güven seviyesi — belirgin bir güçlendirici veya zayıflatıcı sinyal tespit edilmedi.");
    }

    return { confidence, reasons };
  }
}

export const confidenceService = new ConfidenceService();
