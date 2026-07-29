/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/dosage.evaluator.test.ts */

import { describe, it } from "vitest";
import { DosageEvaluator } from "./dosage.evaluator";
import { DosageRuleRepository } from "../../repositories/dosage-rule.repository";
import { DosageRule } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

class MockDosageRuleRepository extends DosageRuleRepository {
  constructor(private readonly mockRules: DosageRule[]) { super(); }
  public async getActiveByChemicalId(chemicalId: string): Promise<DosageRule[]> {
    return this.mockRules.filter((r) => r.chemicalId === chemicalId);
  }
}

async function main() {
  const domatesRule: DosageRule = {
    id: "dr-domates", chemicalId: "chem-1", plantName: "Domates", dosageAmount: 100, dosageUnit: "ml/100L",
    minimumDose: 50, maximumDose: 150, intervalDays: 7, version: 2, isActive: true, sourceType: "Resmi Etiket", createdAt: "",
  };
  const biberRule: DosageRule = {
    id: "dr-biber", chemicalId: "chem-1", plantName: "Biber", dosageAmount: 80, dosageUnit: "ml/100L",
    intervalDays: 5, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "",
  };

  console.log("=== supports() (regresyon) ===");
  const evaluator = new DosageEvaluator(new MockDosageRuleRepository([domatesRule, biberRule]));
  check("chemicalId varsa supports=true", evaluator.supports({ chemicalId: "chem-1" }));
  check("chemicalId yoksa supports=false", !evaluator.supports({}));

  console.log("\n=== evaluate() — kural yok (regresyon) ===");
  const emptyEvaluator = new DosageEvaluator(new MockDosageRuleRepository([]));
  const result2 = await emptyEvaluator.evaluate({ chemicalId: "chem-999" });
  check("Kural yoksa INSUFFICIENT_DATA", result2.status === "INSUFFICIENT_DATA");
  check("Kural yoksa blocking=true", result2.blocking === true);

  console.log("\n=== YENİ: evaluate() — birden fazla aday, plantName ile DOĞRU olan seçiliyor ===");
  const resultBiber = await evaluator.evaluate({ chemicalId: "chem-1", plantName: "Biber" });
  check("plantName ile eşleşen kural seçiliyor (Biber, Domates DEĞİL)", resultBiber.ruleId === "dr-biber");

  console.log("\n=== YENİ: evaluate() — doz aralık İÇİNDE ===");
  const resultInRange = await evaluator.evaluate({ chemicalId: "chem-1", plantName: "Domates" });
  check("Aralık içindeyse PASS", resultInRange.status === "PASS");
  check("ruleId doğru (Domates)", resultInRange.ruleId === "dr-domates");

  console.log("\n=== YENİ: evaluate() — geçersiz kural (min > max), RuleValidator reddediyor ===");
  const invalidRule: DosageRule = {
    id: "dr-invalid", chemicalId: "chem-2", plantName: "Zeytin", dosageAmount: 100, dosageUnit: "ml",
    minimumDose: 200, maximumDose: 50, intervalDays: 7, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "",
  };
  const invalidEvaluator = new DosageEvaluator(new MockDosageRuleRepository([invalidRule]));
  const resultInvalid = await invalidEvaluator.evaluate({ chemicalId: "chem-2" });
  check("Geçersiz kural (min>max) INSUFFICIENT_DATA döner (asla kullanılmaz)", resultInvalid.status === "INSUFFICIENT_DATA");
  check("Geçersiz kural blocking=true (güvenlik)", resultInvalid.blocking === true);

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) throw new Error(`${failed} test başarısız oldu`);
}

describe("dosage.evaluator", () => {
  it("mevcut senaryo doğrulamalarının tümünü PASS ile geçer", async () => {
    await main();
  });
});
