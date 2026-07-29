/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/compatibility.evaluator.test.ts */

import { CompatibilityEvaluator } from "./compatibility.evaluator";
import { CompatibilityRuleRepository } from "../../repositories/compatibility-rule.repository";
import { CompatibilityRule } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

class MockCompatibilityRuleRepository extends CompatibilityRuleRepository {
  constructor(private readonly mockRules: CompatibilityRule[]) { super(); }
  public async findActiveBetween(a: string, b: string): Promise<CompatibilityRule | null> {
    return this.mockRules.find((r) =>
      (r.inventoryItemIdA === a && r.inventoryItemIdB === b) || (r.inventoryItemIdA === b && r.inventoryItemIdB === a)
    ) ?? null;
  }
}

async function main() {
  const incompatibleRule: CompatibilityRule = {
    id: "cr-1", inventoryItemIdA: "A", inventoryItemIdB: "B", isCompatible: false,
    version: 1, isActive: true, sourceType: "Bilimsel Kaynak", createdAt: "",
  };

  console.log("=== supports() ===");
  const evaluator = new CompatibilityEvaluator(new MockCompatibilityRuleRepository([incompatibleRule]));
  check("2+ urun varsa supports=true", evaluator.supports({ inventoryItemIds: ["A", "B"] }));
  check("Tek urun varsa supports=false", !evaluator.supports({ inventoryItemIds: ["A"] }));

  console.log("\n=== evaluate() — UYUMSUZ karisim (kritik guvenlik senaryosu) ===");
  const result = await evaluator.evaluate({ inventoryItemIds: ["A", "B"] });
  check("Uyumsuzsa priority=CRITICAL", result.priority === "CRITICAL");
  check("Uyumsuzsa blocking=true", result.blocking === true);

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
