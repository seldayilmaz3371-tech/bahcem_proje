/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";
import { DosageRuleRepository } from "../../repositories/dosage-rule.repository";
import { matchesPlantName } from "./rule-filtering.util";
import { ruleValidatorService } from "./rule-validator.service";

/**
 * Sprint 5E — Rule Evaluation. Artık yalnızca "kural var mı" demiyor:
 *
 * 1. Birden fazla aktif kural varsa (aynı ilaç, farklı bitkiler için),
 *    `context.plantName` ile EŞLEŞENİ seçer — Sprint 5D'de bu eşleştirme
 *    HİÇ yapılmıyordu (bulunan ve düzeltilen gerçek bir eksiklik).
 * 2. Seçilen kuralı `RuleValidatorService` ile doğrular — hatalı bir
 *    kural kaydı (örn. minimumDose > maximumDose) varsa, GÜVENLİ bir
 *    şekilde INSUFFICIENT_DATA döner (hiçbir zaman hatalı veriye
 *    dayanarak PASS vermez).
 * 3. `dosageAmount`'ın minimumDose/maximumDose aralığında olup
 *    olmadığını raporlar (bilgilendirici — bu değerler zaten
 *    kuralın KENDİSİNDE, ayrıca bir "hesaplama" yapılmıyor).
 */
export class DosageEvaluator extends BaseEvaluator {
  public readonly name = "DosageEvaluator";

  constructor(private readonly dosageRuleRepository: DosageRuleRepository) {
    super();
  }

  public supports(context: EvaluatorContext): boolean {
    return !!context.chemicalId;
  }

  protected async doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    const allRules = await this.dosageRuleRepository.getActiveByChemicalId(context.chemicalId!);

    if (allRules.length === 0) {
      return {
        status: "INSUFFICIENT_DATA",
        priority: "HIGH",
        blocking: true,
        reason: "Bu ilaç için doğrulanmış bir dozaj kuralı bulunamadı.",
        metadata: { loadedRuleCount: 0, activeRuleCount: 0 },
      };
    }

    // Sprint 5E — Rule Filtering: birden fazla aday varsa, context.plantName
    // ile eşleşen TERCİH EDİLİR. Eşleşme yoksa (veya plantName verilmediyse)
    // ilk aday kullanılır — bu, belirsizliğin AÇIKÇA loglanmasını sağlar.
    const matchedRule = context.plantName
      ? allRules.find((r) => matchesPlantName(r.plantName, context.plantName!)) ?? allRules[0]
      : allRules[0];

    const validation = ruleValidatorService.validateDosageRule(matchedRule);
    if (!validation.isValid) {
      return {
        status: "INSUFFICIENT_DATA",
        priority: "CRITICAL",
        blocking: true,
        reason: "Seçilen dozaj kuralı geçersiz veri içeriyor, güvenlik nedeniyle kullanılmadı.",
        evidence: validation.errors,
        ruleId: matchedRule.id,
        ruleVersion: matchedRule.version,
        metadata: { loadedRuleCount: allRules.length, activeRuleCount: allRules.length },
      };
    }

    const withinRange =
      (matchedRule.minimumDose === undefined || matchedRule.dosageAmount >= matchedRule.minimumDose) &&
      (matchedRule.maximumDose === undefined || matchedRule.dosageAmount <= matchedRule.maximumDose);

    const evidence = [`Önerilen doz: ${matchedRule.dosageAmount} ${matchedRule.dosageUnit}`];
    if (matchedRule.minimumDose !== undefined) evidence.push(`Minimum: ${matchedRule.minimumDose} ${matchedRule.dosageUnit}`);
    if (matchedRule.maximumDose !== undefined) evidence.push(`Maksimum: ${matchedRule.maximumDose} ${matchedRule.dosageUnit}`);

    return {
      status: withinRange ? "PASS" : "FAIL",
      priority: withinRange ? "NORMAL" : "HIGH",
      blocking: !withinRange,
      reason: withinRange
        ? `Doğrulanmış dozaj kuralı bulundu: ${matchedRule.dosageAmount} ${matchedRule.dosageUnit} (aralık içinde).`
        : `Önerilen doz, tanımlı güvenli aralığın DIŞINDA.`,
      evidence,
      ruleId: matchedRule.id,
      ruleVersion: matchedRule.version,
      metadata: { loadedRuleCount: allRules.length, activeRuleCount: allRules.length },
    };
  }
}
