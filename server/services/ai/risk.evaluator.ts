/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";
import { SafetyWarningRepository } from "../../repositories/safety-warning.repository";

/**
 * Sprint 5E — Rule Evaluation. Artık yalnızca uyarı VARLIĞINI
 * raporlamıyor — `triggerCondition` metnini (varsa) context'in
 * ilgili alanlarıyla (plantName) BASİT bir substring eşleşmesiyle
 * karşılaştırıp, tetikleyici koşulun GEÇERLİ olup olmadığını
 * değerlendiriyor (AI'sız, deterministik — bu geceki
 * metadata-extraction.util.ts ile aynı felsefe).
 */
export class RiskEvaluator extends BaseEvaluator {
  public readonly name = "RiskEvaluator";

  constructor(private readonly safetyWarningRepository: SafetyWarningRepository) {
    super();
  }

  public supports(context: EvaluatorContext): boolean {
    return !!context.chemicalId;
  }

  protected async doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    const warnings = await this.safetyWarningRepository.getActiveByChemicalId(context.chemicalId!);

    if (warnings.length === 0) {
      return {
        status: "NOT_APPLICABLE",
        priority: "INFO",
        blocking: false,
        reason: "Bu ilaç için aktif bir güvenlik uyarısı bulunmuyor.",
        metadata: { loadedRuleCount: 0, activeRuleCount: 0 },
      };
    }

    // Tetikleyici koşulu OLMAYAN uyarılar her zaman GEÇERLİ sayılır (genel uyarı).
    // Tetikleyici koşulu OLAN uyarılar, yalnızca context.plantName ile eşleşiyorsa GEÇERLİ sayılır.
    const applicableWarnings = warnings.filter((w) => {
      if (!w.triggerCondition) return true;
      if (!context.plantName) return false;
      return w.triggerCondition.toLocaleLowerCase("tr-TR").includes(context.plantName.toLocaleLowerCase("tr-TR"));
    });

    const hasCritical = applicableWarnings.some((w) => w.severity === "CRITICAL");

    return {
      status: applicableWarnings.length > 0 ? "FAIL" : "PASS",
      priority: hasCritical ? "CRITICAL" : applicableWarnings.length > 0 ? "HIGH" : "INFO",
      blocking: hasCritical,
      reason: applicableWarnings.length > 0
        ? `${applicableWarnings.length} güvenlik uyarısı bu bağlam için GEÇERLİ (toplam ${warnings.length} aktif uyarıdan).`
        : `${warnings.length} aktif uyarı var, ancak hiçbiri bu bağlam için geçerli değil.`,
      warnings: applicableWarnings.map((w) => w.message),
      metadata: { loadedRuleCount: warnings.length, activeRuleCount: applicableWarnings.length },
    };
  }
}
