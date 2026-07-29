/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";
import { ProductApplicationRepository } from "../../repositories/inventory.repository";
import { DosageRuleRepository } from "../../repositories/dosage-rule.repository";

/**
 * Sprint 5E — Rule Evaluation. Artık yalnızca geçmiş kayıt SAYISINI
 * raporlamıyor — `context.chemicalId` verilmişse, DosageRule'daki
 * `intervalDays` (tekrar uygulama aralığı) ile SON uygulama tarihini
 * KARŞILAŞTIRIP "tekrar uygulama için yeterli süre geçti mi" sorusunu
 * GERÇEKTEN cevaplıyor.
 */
export class HistoryEvaluator extends BaseEvaluator {
  public readonly name = "HistoryEvaluator";

  constructor(
    private readonly productApplicationRepository: ProductApplicationRepository,
    private readonly dosageRuleRepository: DosageRuleRepository
  ) {
    super();
  }

  public supports(context: EvaluatorContext): boolean {
    return !!context.parcelId;
  }

  protected async doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    const allApplications = await this.productApplicationRepository.getAll();
    const relevant = allApplications
      .filter((a) => a.parcelIds.includes(context.parcelId!))
      .sort((a, b) => new Date(b.applicationDate).getTime() - new Date(a.applicationDate).getTime());

    if (relevant.length === 0) {
      return {
        status: "PASS",
        priority: "INFO",
        blocking: false,
        reason: "Bu parsel için hiç geçmiş uygulama kaydı yok — tekrar aralığı kısıtı geçerli değil.",
        evidence: [],
        metadata: { loadedRuleCount: allApplications.length, activeRuleCount: 0 },
      };
    }

    // intervalDays karşılaştırması yalnızca chemicalId ile bir DosageRule bulunabiliyorsa yapılabilir.
    if (!context.chemicalId) {
      return {
        status: "PASS",
        priority: "INFO",
        blocking: false,
        reason: `Bu parsel için ${relevant.length} geçmiş uygulama kaydı var (chemicalId verilmediği için tekrar aralığı kontrol edilmedi).`,
        evidence: [relevant[0].applicationDate],
        metadata: { loadedRuleCount: allApplications.length, activeRuleCount: relevant.length },
      };
    }

    const dosageRules = await this.dosageRuleRepository.getActiveByChemicalId(context.chemicalId);
    if (dosageRules.length === 0) {
      return {
        status: "INSUFFICIENT_DATA",
        priority: "NORMAL",
        blocking: false,
        reason: "Tekrar aralığı bilgisi (intervalDays) için doğrulanmış bir dozaj kuralı bulunamadı.",
        metadata: { loadedRuleCount: allApplications.length, activeRuleCount: relevant.length },
      };
    }

    const intervalDays = dosageRules[0].intervalDays;
    const daysSinceLastApplication = Math.floor((Date.now() - new Date(relevant[0].applicationDate).getTime()) / (1000 * 60 * 60 * 24));
    const intervalRespected = daysSinceLastApplication >= intervalDays;

    return {
      status: intervalRespected ? "PASS" : "FAIL",
      priority: intervalRespected ? "INFO" : "CRITICAL",
      blocking: !intervalRespected,
      reason: intervalRespected
        ? `Son uygulamadan bu yana ${daysSinceLastApplication} gün geçti (gerekli: ${intervalDays} gün) — tekrar uygulama UYGUN.`
        : `Son uygulamadan bu yana yalnızca ${daysSinceLastApplication} gün geçti (gerekli: ${intervalDays} gün) — tekrar uygulama için ERKEN.`,
      evidence: [`Son uygulama: ${relevant[0].applicationDate}`, `Gerekli aralık: ${intervalDays} gün`],
      ruleId: dosageRules[0].id,
      ruleVersion: dosageRules[0].version,
      metadata: { loadedRuleCount: allApplications.length, activeRuleCount: relevant.length },
    };
  }
}
