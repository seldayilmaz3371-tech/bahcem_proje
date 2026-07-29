/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/nutrition.evaluator.test.ts */

import { NutritionEvaluator } from "./nutrition.evaluator";
import { NutritionRuleRepository } from "../../repositories/nutrition-rule.repository";
import { NutritionRule } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

class MockNutritionRuleRepository extends NutritionRuleRepository {
  constructor(private readonly mockRules: NutritionRule[]) { super(); }
  public async getActiveByFertilizerId(fertilizerId: string): Promise<NutritionRule[]> {
    return this.mockRules.filter((r) => r.fertilizerId === fertilizerId);
  }
}

async function main() {
  const mockRule: NutritionRule = {
    id: "nr-1", fertilizerId: "fert-1", plantName: "Zeytin", dosageAmount: 50, dosageUnit: "gr/ağaç",
    version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "",
  };

  console.log("=== supports() ===");
  const evaluator = new NutritionEvaluator(new MockNutritionRuleRepository([mockRule]));
  check("fertilizerId varsa supports=true", evaluator.supports({ fertilizerId: "fert-1" }));
  check("fertilizerId yoksa supports=false", !evaluator.supports({}));

  console.log("\n=== evaluate() ===");
  const result = await evaluator.evaluate({ fertilizerId: "fert-1" });
  check("Kural bulunursa PASS", result.status === "PASS");

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
