/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 4D — Intent Router.
 *
 * TEMEL PRENSİP: Bu servis bir AI modeli DEĞİLDİR, bir Retrieval
 * sistemi DEĞİLDİR, bir Prompt sistemi DEĞİLDİR — tek görevi "gelen
 * istek hangi işleme gitmeli?" sorusunu, tamamen yerel, deterministik,
 * AI çağrısı GEREKTİRMEYEN bir mantıkla cevaplamaktır (bu geceki
 * `semantic-chunking.util.ts`/`metadata-extraction.util.ts` ile aynı
 * felsefe: hızlı, ucuz, açıklanabilir).
 *
 * SPRINT 4D SINIRI (bilinçli): Bu sprint yalnızca sınıflandırma
 * MİMARİSİNİ hazırlar. Sınıflandırma sonucu, mevcut `chat-assistant.
 * service.ts`/`parcel-recommendation.service.ts` akışlarını HENÜZ
 * DEĞİŞTİRMEZ — yalnızca gözlemsel olarak hesaplanıp döndürülür/loglanır.
 * "Inventory Question → doğrudan veritabanı" gibi YENİ işlem hatlarının
 * GERÇEKTEN inşa edilmesi, açıkça sonraki bir sprintin konusu (bkz.
 * `INTENT_ROUTING_PLANS` — bu haritalar şu an yalnızca TANIMLANMIŞ,
 * henüz hiçbiri ÇALIŞTIRILMIYOR).
 *
 * GENİŞLETİLEBİLİRLİK: Yeni bir intent eklemek, yalnızca `Intent`
 * union tipine yeni bir değer ve `INTENT_RULES`/`INTENT_ROUTING_PLANS`
 * listelerine yeni bir kayıt eklemeyi gerektirir — mevcut sınıflandırma
 * ALGORİTMASINA (aşağıdaki `classify` fonksiyonu) hiçbir değişiklik
 * gerekmez.
 */

export type Intent =
  | "GeneralChat"
  | "ParcelRecommendation"
  | "ParcelHistory"
  | "ObservationQuestion"
  | "PlantInformation"
  | "DiseasePestQuestion"
  | "WeatherRelated"
  | "FarmManagement"
  | "InventoryQuestion"
  | "FinanceQuestion"
  | "GeneralAgriculture"
  | "Unknown";

export interface IntentClassificationParams {
  userMessage: string;
  /** Aktif bir parsel bağlamında mı çağrıldı (örn. Karar Destek) — mevcut, GERÇEK bilgi, tahmin değil. */
  hasParcelContext: boolean;
  /** Aktif parselin gerçek cropType'ı (varsa) — içerikten tahmin edilmez. */
  cropType?: string;
}

export interface IntentClassificationResult {
  intent: Intent;
  /** Açıklanabilirlik için: bu karara yol açan anahtar kelime(ler). */
  matchedKeywords: string[];
}

/**
 * Her intent için, hangi mevcut mimari bileşenlerin (Context Builder /
 * Plant Knowledge / Enhanced Retrieval / Gemini / doğrudan veritabanı)
 * kullanılacağının TANIMI — bkz. Sprint 4D Görev 4. Bu yalnızca bir
 * PLAN/BELGE amaçlıdır, bu sprintte hiçbir servis bu plana göre
 * GERÇEKTEN yönlendirilmiyor (bkz. sınıf üstü açıklama).
 */
export interface IntentRoutingPlan {
  usesContextBuilder: boolean;
  usesPlantKnowledge: boolean;
  usesEnhancedRetrieval: boolean;
  usesGemini: boolean;
  usesDatabaseDirectly: boolean;
  description: string;
}

export const INTENT_ROUTING_PLANS: Record<Intent, IntentRoutingPlan> = {
  GeneralChat: {
    usesContextBuilder: true, usesPlantKnowledge: false, usesEnhancedRetrieval: true, usesGemini: true, usesDatabaseDirectly: false,
    description: "Context Builder → Enhanced Retrieval → Gemini (mevcut Genel Sohbet akışı)",
  },
  ParcelRecommendation: {
    usesContextBuilder: true, usesPlantKnowledge: true, usesEnhancedRetrieval: true, usesGemini: true, usesDatabaseDirectly: false,
    description: "Context Builder → Plant Knowledge → Enhanced Retrieval → Gemini (mevcut Karar Destek akışı)",
  },
  PlantInformation: {
    usesContextBuilder: true, usesPlantKnowledge: true, usesEnhancedRetrieval: true, usesGemini: true, usesDatabaseDirectly: false,
    description: "Context Builder → Plant Knowledge → Enhanced Retrieval → Gemini",
  },
  DiseasePestQuestion: {
    usesContextBuilder: true, usesPlantKnowledge: true, usesEnhancedRetrieval: true, usesGemini: true, usesDatabaseDirectly: false,
    description: "Context Builder → Plant Knowledge → Enhanced Retrieval → Gemini",
  },
  InventoryQuestion: {
    usesContextBuilder: false, usesPlantKnowledge: false, usesEnhancedRetrieval: false, usesGemini: false, usesDatabaseDirectly: true,
    description: "Veritabanı → Gerekirse Gemini (HENÜZ İNŞA EDİLMEDİ — yalnızca plan, Sprint 4D kapsamı dışı)",
  },
  ParcelHistory: {
    usesContextBuilder: false, usesPlantKnowledge: false, usesEnhancedRetrieval: false, usesGemini: false, usesDatabaseDirectly: true,
    description: "Veritabanı → Gerekirse Gemini (HENÜZ İNŞA EDİLMEDİ — yalnızca plan, Sprint 4D kapsamı dışı)",
  },
  ObservationQuestion: {
    usesContextBuilder: false, usesPlantKnowledge: false, usesEnhancedRetrieval: false, usesGemini: false, usesDatabaseDirectly: true,
    description: "Veritabanı → Gerekirse Gemini (HENÜZ İNŞA EDİLMEDİ — yalnızca plan, Sprint 4D kapsamı dışı)",
  },
  WeatherRelated: {
    usesContextBuilder: true, usesPlantKnowledge: false, usesEnhancedRetrieval: false, usesGemini: true, usesDatabaseDirectly: false,
    description: "Context Builder (hava durumu) → Gemini (RAG'a gerek yok)",
  },
  FarmManagement: {
    usesContextBuilder: true, usesPlantKnowledge: true, usesEnhancedRetrieval: true, usesGemini: true, usesDatabaseDirectly: false,
    description: "Context Builder → Plant Knowledge → Enhanced Retrieval → Gemini",
  },
  FinanceQuestion: {
    usesContextBuilder: false, usesPlantKnowledge: false, usesEnhancedRetrieval: false, usesGemini: false, usesDatabaseDirectly: true,
    description: "Veritabanı → Gerekirse Gemini (HENÜZ İNŞA EDİLMEDİ — yalnızca plan, Sprint 4D kapsamı dışı)",
  },
  GeneralAgriculture: {
    usesContextBuilder: true, usesPlantKnowledge: false, usesEnhancedRetrieval: true, usesGemini: true, usesDatabaseDirectly: false,
    description: "Context Builder → Enhanced Retrieval → Gemini (Genel Sohbet ile aynı)",
  },
  Unknown: {
    usesContextBuilder: true, usesPlantKnowledge: false, usesEnhancedRetrieval: true, usesGemini: true, usesDatabaseDirectly: false,
    description: "General Chat akışına düşer (güvenli varsayılan — bkz. Sprint 4D Görev 4)",
  },
};

interface IntentRule {
  intent: Intent;
  keywords: string[];
  /** true ise, bu kural yalnızca aktif bir parsel bağlamı varken değerlendirilir. */
  requiresParcelContext?: boolean;
}

/**
 * Kurallar ÖNCELİK SIRASINA göre dizilmiştir — ilk eşleşen kural
 * kazanır. Yeni bir intent eklemek, yalnızca bu diziye yeni bir kayıt
 * eklemeyi gerektirir (bkz. GENİŞLETİLEBİLİRLİK, dosya üstü açıklama).
 */
const INTENT_RULES: IntentRule[] = [
  { intent: "InventoryQuestion", keywords: ["stok", "envanter", "depo", "kaç litre", "kaç kilo", "kaldı mı"] },
  { intent: "FinanceQuestion", keywords: ["gelir", "gider", "maliyet", "kâr", "kar ", "satış", "harcama", "fiyat"] },
  { intent: "WeatherRelated", keywords: ["hava durumu", "yağmur", "don riski", "sıcaklık", "nem"] },
  { intent: "DiseasePestQuestion", keywords: ["hastalık", "zararlı", "leke", "böcek", "mantar", "çürük", "sinek", "küf"] },
  { intent: "PlantInformation", keywords: ["nedir", "özellikleri", "hakkında bilgi", "yaşam döngüsü", "bilimsel adı"] },
  { intent: "ParcelHistory", keywords: ["ne zaman", "en son", "geçmişte", "daha önce"] },
  { intent: "ParcelRecommendation", keywords: ["ne yapmalıyım", "öneri", "tavsiye", "durum nasıl", "analiz"], requiresParcelContext: true },
  { intent: "ObservationQuestion", keywords: ["gözlem", "not ettim", "kaydettim"] },
  { intent: "FarmManagement", keywords: ["plan", "program", "takvim", "haftalık"] },
];

export class IntentRouterService {
  /**
   * Kullanıcı mesajını (ve varsa parsel bağlamını) sınıflandırır.
   * Hiçbir kural eşleşmezse `"Unknown"` döner — bu bir hata DEĞİLDİR,
   * `INTENT_ROUTING_PLANS.Unknown`'ın belirttiği gibi güvenli bir
   * şekilde mevcut Genel Sohbet akışına düşer.
   */
  public classify(params: IntentClassificationParams): IntentClassificationResult {
    const normalized = params.userMessage.trim().toLocaleLowerCase("tr-TR");

    for (const rule of INTENT_RULES) {
      if (rule.requiresParcelContext && !params.hasParcelContext) continue;

      const matchedKeywords = rule.keywords.filter((kw) => normalized.includes(kw));
      if (matchedKeywords.length > 0) {
        return { intent: rule.intent, matchedKeywords };
      }
    }

    return { intent: "Unknown", matchedKeywords: [] };
  }
}

export const intentRouterService = new IntentRouterService();
