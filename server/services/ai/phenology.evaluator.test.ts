/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/phenology.evaluator.test.ts */

import { describe, it } from "vitest";
import { PhenologyEvaluator } from "./phenology.evaluator";
import { PhenologyRuleRepository } from "../../repositories/phenology-rule.repository";
import { PhenologyRule } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

class MockPhenologyRuleRepository extends PhenologyRuleRepository {
  constructor(private readonly mockRules: PhenologyRule[]) { super(); }
  public async getActiveByPlantName(plantName: string): Promise<PhenologyRule[]> {
    return this.mockRules.filter((r) => r.plantName === plantName);
  }
}

async function main() {
  const mockRule: PhenologyRule = {
    id: "pr-1", plantName: "Limon", growthStage: "Çiçeklenme", restrictionNote: "İlaçlama yapılmamalı",
    version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "",
  };

  console.log("=== supports() ===");
  const evaluator = new PhenologyEvaluator(new MockPhenologyRuleRepository([mockRule]));
  check("plantName varsa supports=true", evaluator.supports({ plantName: "Limon" }));
  check("plantName yoksa supports=false", !evaluator.supports({}));

  console.log("\n=== evaluate() — eşleşmeyen bitki (regresyon) ===");
  const result2 = await evaluator.evaluate({ plantName: "Domates" });
  check("Kural bulunamazsa NOT_APPLICABLE", result2.status === "NOT_APPLICABLE");

  console.log("\n=== YENİ: evaluate() — bitki eşleşiyor, growthStage VERİLMEDİ ===");
  const resultNoStage = await evaluator.evaluate({ plantName: "Limon" });
  check("growthStage yoksa INSUFFICIENT_DATA", resultNoStage.status === "INSUFFICIENT_DATA");

  console.log("\n=== YENİ: evaluate() — bitki VE dönem eşleşiyor, kısıtlama VAR ===");
  const resultMatch = await evaluator.evaluate({ plantName: "Limon", growthStage: "Çiçeklenme" });
  check("Dönem eşleşirse PASS", resultMatch.status === "PASS");
  check("Kısıtlama varsa priority=HIGH", resultMatch.priority === "HIGH");
  check("Kısıtlama notu evidence'da", resultMatch.evidence?.includes("İlaçlama yapılmamalı"));

  console.log("\n=== YENİ: evaluate() — bitki eşleşiyor, GÜNCEL dönem FARKLI ===");
  const resultMismatch = await evaluator.evaluate({ plantName: "Limon", growthStage: "Meyve Tutumu" });
  check("Dönem eşleşmezse NOT_APPLICABLE", resultMismatch.status === "NOT_APPLICABLE");

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) throw new Error(`${failed} test başarısız oldu`);
}

describe("phenology.evaluator", () => {
  it("mevcut senaryo doğrulamalarının tümünü PASS ile geçer", async () => {
    await main();
  });
});
