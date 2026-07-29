/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";
import { PhenologyRuleRepository } from "../../repositories/phenology-rule.repository";

/**
 * Sprint 5E — Rule Evaluation. Artık yalnızca "kural var mı" demiyor —
 * `context.growthStage` (parselin/ağacın GÜNCEL dönemi) ile
 * `PhenologyRule.growthStage`'i (kuralın geçerli olduğu dönem)
 * KARŞILAŞTIRIR. Eşleşmezse, o kuralın `restrictionNote`'u bu dönem
 * için GEÇERLİ DEĞİLDİR — bu açıkça raporlanır.
 */
export class PhenologyEvaluator extends BaseEvaluator {
  public readonly name = "PhenologyEvaluator";

  constructor(private readonly phenologyRuleRepository: PhenologyRuleRepository) {
    super();
  }

  public supports(context: EvaluatorContext): boolean {
    return !!context.plantName;
  }

  protected async doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    const rules = await this.phenologyRuleRepository.getActiveByPlantName(context.plantName!);

    if (rules.length === 0) {
      return {
        status: "NOT_APPLICABLE",
        priority: "INFO",
        blocking: false,
        reason: `'${context.plantName}' için tanımlı fenolojik kural bulunamadı.`,
        metadata: { loadedRuleCount: 0, activeRuleCount: 0 },
      };
    }

    if (!context.growthStage) {
      return {
        status: "INSUFFICIENT_DATA",
        priority: "NORMAL",
        blocking: false,
        reason: `'${context.plantName}' için ${rules.length} fenolojik kural var, ancak parselin GÜNCEL gelişim dönemi belirtilmediği için eşleştirme yapılamadı.`,
        metadata: { loadedRuleCount: rules.length, activeRuleCount: rules.length },
      };
    }

    const matchingRule = rules.find((r) => r.growthStage === context.growthStage);
    const hasRestriction = !!matchingRule?.restrictionNote;

    return {
      status: matchingRule ? "PASS" : "NOT_APPLICABLE",
      priority: hasRestriction ? "HIGH" : "INFO",
      blocking: false,
      reason: matchingRule
        ? hasRestriction
          ? `'${context.growthStage}' dönemi için kısıtlama notu mevcut.`
          : `'${context.growthStage}' dönemi için tanımlı bir kural bulundu, kısıtlama yok.`
        : `Mevcut kurallar, parselin GÜNCEL dönemi olan '${context.growthStage}' ile eşleşmiyor.`,
      evidence: matchingRule?.restrictionNote ? [matchingRule.restrictionNote] : undefined,
      ruleId: matchingRule?.id,
      ruleVersion: matchingRule?.version,
      metadata: { loadedRuleCount: rules.length, activeRuleCount: rules.length },
    };
  }
}
