/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/history.evaluator.test.ts */

import { describe, it } from "vitest";
import { HistoryEvaluator } from "./history.evaluator";
import { ProductApplicationRepository } from "../../repositories/inventory.repository";
import { DosageRuleRepository } from "../../repositories/dosage-rule.repository";
import { ProductApplication, DosageRule } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

class MockProductApplicationRepository extends ProductApplicationRepository {
  constructor(private readonly mockApps: ProductApplication[]) { super(); }
  public async getAll(): Promise<ProductApplication[]> { return this.mockApps; }
}

class MockDosageRuleRepository extends DosageRuleRepository {
  constructor(private readonly mockRules: DosageRule[]) { super(); }
  public async getActiveByChemicalId(chemicalId: string): Promise<DosageRule[]> {
    return this.mockRules.filter((r) => r.chemicalId === chemicalId);
  }
}

async function main() {
  const recentApp: ProductApplication = {
    id: "pa-1", inventoryItemId: "item-1", applicationDate: new Date().toISOString(),
    parcelIds: ["parcel-1"], treeIds: [], createdAt: "",
  };
  const oldApp: ProductApplication = {
    id: "pa-2", inventoryItemId: "item-1", applicationDate: "2020-01-01",
    parcelIds: ["parcel-2"], treeIds: [], createdAt: "",
  };
  const dosageRule: DosageRule = {
    id: "dr-1", chemicalId: "chem-1", plantName: "Domates", dosageAmount: 100, dosageUnit: "ml",
    intervalDays: 7, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "",
  };

  console.log("=== supports() ===");
  const evaluator = new HistoryEvaluator(
    new MockProductApplicationRepository([recentApp, oldApp]),
    new MockDosageRuleRepository([dosageRule])
  );
  check("parcelId varsa supports=true", evaluator.supports({ parcelId: "parcel-1" }));
  check("parcelId yoksa supports=false", !evaluator.supports({}));

  console.log("\n=== evaluate() — gecmis yok (regresyon) ===");
  const resultNoHistory = await evaluator.evaluate({ parcelId: "parcel-yok" });
  check("Gecmis yoksa PASS", resultNoHistory.status === "PASS");

  console.log("\n=== evaluate() — chemicalId YOK, intervalDays kontrolu yapilamiyor (regresyon) ===");
  const resultNoChemical = await evaluator.evaluate({ parcelId: "parcel-2" });
  check("chemicalId yoksa PASS (intervalDays kontrol edilmedi)", resultNoChemical.status === "PASS");

  console.log("\n=== YENI: evaluate() — SON uygulamadan bu yana YETERSIZ sure gecti (BUGUN yapildi) ===");
  const resultTooSoon = await evaluator.evaluate({ parcelId: "parcel-1", chemicalId: "chem-1" });
  check("Yetersiz sure gecmisse FAIL", resultTooSoon.status === "FAIL");
  check("Yetersiz surede blocking=true", resultTooSoon.blocking === true);

  console.log("\n=== YENI: evaluate() — SON uygulamadan bu yana YETERLI sure gecti (2020'de yapildi) ===");
  const resultEnoughTime = await evaluator.evaluate({ parcelId: "parcel-2", chemicalId: "chem-1" });
  check("Yeterli sure gectiyse PASS", resultEnoughTime.status === "PASS");
  check("Yeterli surede blocking=false", resultEnoughTime.blocking === false);

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) throw new Error(`${failed} test başarısız oldu`);
}

describe("history.evaluator", () => {
  it("mevcut senaryo doğrulamalarının tümünü PASS ile geçer", async () => {
    await main();
  });
});
