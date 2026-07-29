/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecisionResult } from "./decision-engine.service";
import { EvaluatorCategory, getEvaluatorDescriptor } from "./evaluator-descriptors";

/**
 * Sprint 5F/5G — Decision Explanation Builder.
 *
 * TEMEL PRENSİP (değişmedi): "Decision Engine KARAR VERİR, Gemini KARAR
 * VERMEZ." Bu servis, DecisionResult'ı Gemini'ye DOĞRUDAN vermek yerine,
 * KESİN talimatlarla sarılmış, GÜVENLİ, SAHA DİLİNE yakın bir prompt
 * bölümüne çevirir — Gemini bu bölümü OKUYUP AÇIKLAR, asla değiştiremez
 * veya yeni bir karar üretemez.
 *
 * SPRINT 5G GENİŞLETMESİ: `build()` imzası KORUNDU (geriye dönük
 * uyumlu) — içerik, talep edilen 8 maddelik sıraya, saha diline ve
 * şablon sistemine göre zenginleştirildi.
 */

type ExplanationTemplate = EvaluatorCategory | "Bilgi Yetersizliği" | "Risk Uyarısı";

export class DecisionExplanationBuilderService {
  public build(decision: DecisionResult): string {
    const template = this.selectTemplate(decision);
    const evaluatorNamesByCategory = this.groupEvaluatorsByDescriptor(decision);
    const insufficientDataItems = this.extractInsufficientData(decision);
    const usedRules = this.extractUsedRules(decision);

    // Sprint 5G — Görev: talep edilen 8 maddelik sıra BİREBİR uygulanıyor.
    const lines: string[] = [];

    // 1. Kararın özeti
    lines.push(`1. KARARIN ÖZETİ: ${this.translateStatus(decision.status)} — ${decision.reason}`);

    // 2. Bu karar neden verildi
    lines.push(`2. NEDEN: ${decision.reason}`);

    // 3. Hangi kurallar etkili oldu
    lines.push(
      usedRules.length > 0
        ? `3. ETKİLİ KURALLAR:\n${usedRules.map((r) => `- ${r}`).join("\n")}`
        : "3. ETKİLİ KURALLAR: Bu karar için doğrulanmış, kayıtlı bir kural bulunamadı."
    );

    // 4. Hangi evaluator'lar çalıştı (Türkçe adlarla — İngilizce sınıf adı KULLANICIYA GÖSTERİLMİYOR)
    lines.push(
      evaluatorNamesByCategory.length > 0
        ? `4. YAPILAN KONTROLLER: ${evaluatorNamesByCategory.join(", ")}`
        : "4. YAPILAN KONTROLLER: Bu bağlam için uygulanabilir bir kontrol bulunamadı."
    );

    // 5. Varsa uyarılar
    if (decision.warnings.length > 0) {
      lines.push(`5. UYARILAR:\n${decision.warnings.map((w) => `- ${w}`).join("\n")}`);
    }

    // 6. Varsa engelleyici nedenler
    if (decision.blockingReasons.length > 0) {
      lines.push(`6. ENGELLEYİCİ NEDENLER:\n${decision.blockingReasons.map((r) => `- ${r}`).join("\n")}`);
    }

    // 7. Eksik veriler
    if (insufficientDataItems.length > 0) {
      lines.push(`7. EKSİK VERİLER:\n${insufficientDataItems.map((i) => `- ${i}`).join("\n")}`);
    }

    // 8. Kullanıcı için önerilen sonraki adımlar — DETERMİNİSTİK, Gemini'ye BIRAKILMAZ (bkz. sınıf üstü açıklama).
    lines.push(`8. ÖNERİLEN SONRAKİ ADIM: ${this.buildNextStepGuidance(decision)}`);

    // Talep edilen 8 maddelik sıranın DIŞINDA, ek bir şeffaflık notu:
    // DecisionResult.evidence, 8 maddede açıkça bir "madde" olarak
    // istenmemişti ama kaybolmaması gerekir (şeffaflık ilkesi) —
    // yalnızca DOLUYSA eklenir.
    if (decision.evidence.length > 0) {
      lines.push(`EK KANIT NOTLARI:\n${decision.evidence.map((e) => `- ${e}`).join("\n")}`);
    }

    const decisionSummary = lines.join("\n\n");

    // Gemini'ye verilen KESİN talimat — SAHA DİLİNE vurgu eklendi (Sprint 5G).
    return `Bu karar, Decision Engine (deterministik, kural tabanlı bir sistem) tarafından ÖNCEDEN verilmiştir — kategori: ${template}. Bu kararı DEĞİŞTİRME, yeni bir karar ÜRETME, doz DEĞİŞTİRME veya kural UYDURMA — yalnızca aşağıdaki kararı, bir ziraat mühendisinin üreticiyle konuşur gibi, KISA, ANLAŞILIR ve EYLEME DÖNÜK bir dille AÇIKLA ve gerekçelendir. Teknik terimler (sınıf adları, kod isimleri) KULLANMA. Eksik veri olduğu belirtilmişse bunu AÇIKÇA söyle; belirsizlik ÜRETME.\n\n${decisionSummary}`;
  }

  /**
   * Sprint 5G — Görev: "hangi açıklama şablonu kullanıldı" loglanabilmeli.
   * `build()`'in imzası DEĞİŞMEDİ (geriye dönük uyumlu) — bu, AYRI,
   * yeni bir public metod. Çağıran taraf (parcel-recommendation.service.ts)
   * bunu yalnızca LOGLAMA amacıyla kullanır.
   */
  public getSelectedTemplateName(decision: DecisionResult): string {
    return this.selectTemplate(decision);
  }

  /**
   * Sprint 5G — Şablon Seçimi (Görev 2: çoklu sinyal). Yalnızca
   * `executedEvaluators`'a değil, `status`, `blockingReasons`,
   * `evidence` ve `evaluatorResults` (priority/ruleId/blocking/warnings)
   * BİRLİKTE değerlendirilir — amaç, yeni bir Evaluator eklendiğinde bu
   * fonksiyonun DEĞİŞTİRİLME ihtiyacını en aza indirmek (yalnızca
   * `evaluator-descriptors.ts`'e yeni bir kayıt eklemek yeterli olsun).
   */
  private selectTemplate(decision: DecisionResult): ExplanationTemplate {
    // En kritik durumlar, kategori ağırlıklandırmasından ÖNCE kontrol edilir.
    if (decision.status === "INSUFFICIENT_DATA") return "Bilgi Yetersizliği";

    const hasCriticalBlockingSignal =
      decision.blockingReasons.length > 0 &&
      decision.evaluatorResults.some((r) => r.priority === "CRITICAL" && r.blocking);
    if (decision.status === "BLOCKED" && hasCriticalBlockingSignal) return "Risk Uyarısı";

    // Kategori ağırlıklandırması: her evaluator'ın kendi sonucunun
    // "ağırlığı" — ruleId taşıyorsa (gerçek bir kural bulundu), blocking
    // ise, veya warnings/evidence taşıyorsa DAHA ETKİLİ sayılır.
    const categoryWeights: Partial<Record<EvaluatorCategory, number>> = {};
    decision.executedEvaluators.forEach((evaluatorName, idx) => {
      const result = decision.evaluatorResults[idx];
      if (!result) return;
      const descriptor = getEvaluatorDescriptor(evaluatorName);
      const weight =
        1 +
        (result.ruleId ? 2 : 0) +
        (result.blocking ? 3 : 0) +
        (result.warnings?.length ? 1 : 0) +
        (result.evidence?.length ? 1 : 0);
      categoryWeights[descriptor.category] = (categoryWeights[descriptor.category] ?? 0) + weight;
    });

    const sortedCategories = Object.entries(categoryWeights).sort((a, b) => b[1] - a[1]);
    return (sortedCategories[0]?.[0] as EvaluatorCategory) ?? "Genel Bakım";
  }

  /** Türkçe, benzersiz evaluator kategorisi/görüntüleme adı listesi — İngilizce sınıf adı ASLA döndürülmez. */
  private groupEvaluatorsByDescriptor(decision: DecisionResult): string[] {
    const displayNames = decision.executedEvaluators.map((name) => getEvaluatorDescriptor(name).displayName);
    return Array.from(new Set(displayNames));
  }

  /** evaluatorResults içinde INSUFFICIENT_DATA olan sonuçların, ilgili evaluator'ın Türkçe adıyla birlikte listesi. */
  private extractInsufficientData(decision: DecisionResult): string[] {
    return decision.evaluatorResults
      .map((result, idx) => ({ result, evaluatorName: decision.executedEvaluators[idx] }))
      .filter(({ result }) => result.status === "INSUFFICIENT_DATA")
      .map(({ result, evaluatorName }) => `${getEvaluatorDescriptor(evaluatorName).displayName}: ${result.reason}`);
  }

  /** evaluatorResults içinde ruleId taşıyan (gerçekten bir Rule Layer kaydı bulunmuş) sonuçların özeti. */
  private extractUsedRules(decision: DecisionResult): string[] {
    return decision.evaluatorResults
      .map((result, idx) => ({ result, evaluatorName: decision.executedEvaluators[idx] }))
      .filter(({ result }) => !!result.ruleId)
      .map(({ result, evaluatorName }) => `${getEvaluatorDescriptor(evaluatorName).displayName} (v${result.ruleVersion}): ${result.reason}`);
  }

  /**
   * Sprint 5G — "Önerilen sonraki adım" DETERMİNİSTİK olarak, yalnızca
   * `status`'e göre üretilir — bu, YENİ bir tarımsal karar DEĞİLDİR,
   * yalnızca "bu durumda genel olarak nasıl davranılır" yönlendirmesidir.
   * Gemini bu metni SADELEŞTİREBİLİR, ama KENDİSİ ÜRETMEZ.
   */
  private buildNextStepGuidance(decision: DecisionResult): string {
    switch (decision.status) {
      case "OK":
        return "Bu işlemi mevcut planlandığı şekilde gerçekleştirebilirsiniz.";
      case "WARNING":
        return "Bu işlemi dikkatli bir şekilde, yukarıdaki uyarıları göz önünde bulundurarak gerçekleştirebilirsiniz.";
      case "BLOCKED":
        return "Bu işlemi ŞU AN gerçekleştirmeyin — önce yukarıdaki engelleyici nedenleri giderin.";
      case "INSUFFICIENT_DATA":
        return "Kesin bir tavsiye verilemiyor — eksik verileri tamamlayıp (örn. güncel hava ölçümü, doz kaydı) tekrar deneyin.";
    }
  }

  private translateStatus(status: DecisionResult["status"]): string {
    switch (status) {
      case "OK": return "Uygun";
      case "WARNING": return "Dikkat Gerekiyor";
      case "BLOCKED": return "Engellendi";
      case "INSUFFICIENT_DATA": return "Yetersiz Veri";
    }
  }
}

export const decisionExplanationBuilderService = new DecisionExplanationBuilderService();
