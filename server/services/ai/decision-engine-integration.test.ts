/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 5D — Decision Engine Integration Test.
 *
 * Bu dosya, Sprint 5C'nin (mock evaluator ile) Unit Test'inden FARKLI:
 * GERÇEK repository'leri ve GERÇEK evaluator'ları (`createRealEvaluators()`)
 * kullanır — Decision Engine'in Rule Layer'dan GERÇEKTEN veri okuyup
 * okuyamadığını kanıtlar. Test verisi bu dosyanın SONUNDA temizlenir.
 *
 * Çalıştırma: npx tsx server/services/ai/decision-engine-integration.test.ts
 */

import { describe, it } from "vitest";
import { decisionEngineService } from "./decision-engine.service";
import { createRealEvaluators } from "./evaluator-registry.service";
import { dosageRuleRepository } from "../../repositories/dosage-rule.repository";
import { phenologyRuleRepository } from "../../repositories/phenology-rule.repository";
import { decisionTemplateRepository } from "../../repositories/decision-template.repository";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

async function main() {
  const createdIds: { repo: { delete: (id: string) => Promise<unknown> }; id: string }[] = [];

  try {
    console.log("=== SENARYO: Rule bulundu (gerçek DosageRule kaydıyla) ===");
    const activeDosage = await dosageRuleRepository.create({
      chemicalId: "integ-chem-1", plantName: "Domates", dosageAmount: 100, dosageUnit: "ml/100L",
      intervalDays: 7, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: new Date().toISOString(),
    });
    createdIds.push({ repo: dosageRuleRepository, id: activeDosage.id });

    const evaluators = createRealEvaluators();
    const result1 = await decisionEngineService.run(evaluators, { chemicalId: "integ-chem-1" });
    const dosageResult = result1.evaluatorResults.find((r) => r.ruleId === activeDosage.id);
    check("DosageEvaluator gerçek repository'den kural buldu", !!dosageResult && dosageResult.status === "PASS");

    console.log("\n=== SENARYO: Rule bulunamadı ===");
    const result2 = await decisionEngineService.run(evaluators, { chemicalId: "integ-chem-olmayan" });
    check("Rule bulunamayınca INSUFFICIENT_DATA/BLOCKED", result2.status === "BLOCKED" || result2.status === "INSUFFICIENT_DATA");

    console.log("\n=== SENARYO: Pasif Rule (isActive=false olan kural GÖRÜLMEMELİ) ===");
    const inactiveDosage = await dosageRuleRepository.create({
      chemicalId: "integ-chem-2", plantName: "Limon", dosageAmount: 50, dosageUnit: "ml/100L",
      intervalDays: 7, version: 1, isActive: false, sourceType: "Resmi Etiket", createdAt: new Date().toISOString(),
    });
    createdIds.push({ repo: dosageRuleRepository, id: inactiveDosage.id });
    const result3 = await decisionEngineService.run(evaluators, { chemicalId: "integ-chem-2" });
    const foundInactive = result3.evaluatorResults.some((r) => r.ruleId === inactiveDosage.id);
    check("Pasif kural DecisionEngine sonucunda GÖRÜNMÜYOR", !foundInactive);

    console.log("\n=== SENARYO: Eski versiyon Rule (pasifleştirilmiş, yeni versiyon aktif) ===");
    const oldVersion = await dosageRuleRepository.create({
      chemicalId: "integ-chem-3", plantName: "Zeytin", dosageAmount: 80, dosageUnit: "ml/100L",
      intervalDays: 7, version: 1, isActive: false, sourceType: "Resmi Etiket", createdAt: new Date().toISOString(),
    });
    const newVersion = await dosageRuleRepository.create({
      chemicalId: "integ-chem-3", plantName: "Zeytin", dosageAmount: 90, dosageUnit: "ml/100L",
      intervalDays: 7, version: 2, isActive: true, supersededBy: undefined, sourceType: "Resmi Etiket", createdAt: new Date().toISOString(),
    });
    await dosageRuleRepository.update(oldVersion.id, { supersededBy: newVersion.id });
    createdIds.push({ repo: dosageRuleRepository, id: oldVersion.id }, { repo: dosageRuleRepository, id: newVersion.id });
    const result4 = await decisionEngineService.run(evaluators, { chemicalId: "integ-chem-3" });
    const usedRule = result4.evaluatorResults.find((r) => r.ruleId);
    check("Yalnızca AKTİF (v2) versiyon kullanılıyor", usedRule?.ruleId === newVersion.id && usedRule?.ruleVersion === 2);

    console.log("\n=== SENARYO: Çoklu Rule ===");
    const secondRule = await dosageRuleRepository.create({
      chemicalId: "integ-chem-1", plantName: "Biber", dosageAmount: 120, dosageUnit: "ml/100L",
      intervalDays: 5, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: new Date().toISOString(),
    });
    createdIds.push({ repo: dosageRuleRepository, id: secondRule.id });
    const result5 = await decisionEngineService.run(evaluators, { chemicalId: "integ-chem-1" });
    const dosageMeta = result5.evaluatorResults.find((r) => r.metadata?.loadedRuleCount)?.metadata;
    check("Çoklu kural (2) doğru sayılıyor", dosageMeta?.loadedRuleCount === 2);

    console.log("\n=== SENARYO: DecisionTemplate bulundu ===");
    const template = await decisionTemplateRepository.create({
      name: "Test Şablonu", plantName: "Domates", dosageRuleId: activeDosage.id,
      version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: new Date().toISOString(),
    });
    createdIds.push({ repo: decisionTemplateRepository, id: template.id });
    const result6 = await decisionEngineService.run(evaluators, { plantName: "Domates" });
    check("DecisionTemplate bulundu", result6.availableDecisionTemplates.some((t) => t.id === template.id));

    console.log("\n=== SENARYO: DecisionTemplate bulunamadı ===");
    const result7 = await decisionEngineService.run(evaluators, { plantName: "HiçbirYerdeYok" });
    check("DecisionTemplate bulunamadı, boş dizi", result7.availableDecisionTemplates.length === 0);

    console.log("\n=== SENARYO: Decision Engine güvenli devam ediyor (birden fazla evaluator, karma sonuç) ===");
    const result8 = await decisionEngineService.run(evaluators, { chemicalId: "integ-chem-1", plantName: "Domates" });
    check("Karma bağlamda çökmeden sonuç üretiyor", result8.status !== undefined);

    console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  } finally {
    // Test verisi temizliği — hangi senaryo çalışırsa çalışsın (hata olsa bile) diskte kalıntı bırakmaz.
    for (const item of createdIds) {
      await item.repo.delete(item.id).catch(() => {});
    }
    console.log("\nTest verileri temizlendi.");
  }

  if (failed > 0) throw new Error(`${failed} test başarısız oldu`);
}

describe("decision-engine-integration", () => {
  it("mevcut senaryo doğrulamalarının tümünü PASS ile geçer", async () => {
    await main();
  });
});
