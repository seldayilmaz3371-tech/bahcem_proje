/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";
import { NutritionRuleRepository } from "../../repositories/nutrition-rule.repository";

/**
 * Sprint 5E — Rule Evaluation. `context.growthStage` verilmişse,
 * NutritionRule.growthStage ile eşleşen kuralı TERCİH EDER (DosageEvaluator'daki
 * plantName eşleştirmesiyle AYNI desen) ve doz bilgisini raporlar.
 */
export class NutritionEvaluator extends BaseEvaluator {
  public readonly name = "NutritionEvaluator";

  constructor(private readonly nutritionRuleRepository: NutritionRuleRepository) {
    super();
  }

  public supports(context: EvaluatorContext): boolean {
    return !!context.fertilizerId;
  }

  protected async doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    const rules = await this.nutritionRuleRepository.getActiveByFertilizerId(context.fertilizerId!);

    if (rules.length === 0) {
      return {
        status: "INSUFFICIENT_DATA",
        priority: "NORMAL",
        blocking: false,
        reason: "Bu gübre için doğrulanmış bir beslenme kuralı bulunamadı.",
        metadata: { loadedRuleCount: 0, activeRuleCount: 0 },
      };
    }

    const matched = context.growthStage
      ? rules.find((r) => r.growthStage === context.growthStage) ?? rules[0]
      : rules[0];

    return {
      status: "PASS",
      priority: "NORMAL",
      blocking: false,
      reason: `Doğrulanmış beslenme kuralı bulundu: ${matched.dosageAmount} ${matched.dosageUnit}${matched.growthStage ? ` (${matched.growthStage} dönemi için)` : ""}.`,
      evidence: [`Doz: ${matched.dosageAmount} ${matched.dosageUnit}`],
      ruleId: matched.id,
      ruleVersion: matched.version,
      metadata: { loadedRuleCount: rules.length, activeRuleCount: rules.length },
    };
  }
}
