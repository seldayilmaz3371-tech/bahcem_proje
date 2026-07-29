/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";
import { CompatibilityRuleRepository } from "../../repositories/compatibility-rule.repository";

/**
 * Sprint 5B — Framework doğrulama iskeleti. Yalnızca BİRDEN FAZLA
 * ürün seçildiğinde anlamlıdır (tek ürünün "karışabilirliği" olmaz).
 */
export class CompatibilityEvaluator extends BaseEvaluator {
  public readonly name = "CompatibilityEvaluator";

  constructor(private readonly compatibilityRuleRepository: CompatibilityRuleRepository) {
    super();
  }

  public supports(context: EvaluatorContext): boolean {
    return !!context.inventoryItemIds && context.inventoryItemIds.length >= 2;
  }

  protected async doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    const [a, b] = context.inventoryItemIds!;
    const rule = await this.compatibilityRuleRepository.findActiveBetween(a, b);

    return {
      status: !rule ? "NOT_APPLICABLE" : rule.isCompatible ? "PASS" : "FAIL",
      priority: rule && !rule.isCompatible ? "CRITICAL" : "INFO",
      blocking: !!rule && !rule.isCompatible,
      reason: rule
        ? `Karışabilirlik kuralı bulundu: ${rule.isCompatible ? "uyumlu" : "UYUMSUZ"}.`
        : "Bu iki ürün için kayıtlı bir karışabilirlik kuralı bulunamadı.",
      ruleId: rule?.id,
      ruleVersion: rule?.version,
      metadata: { loadedRuleCount: rule ? 1 : 0, activeRuleCount: rule ? 1 : 0 },
    };
  }
}
