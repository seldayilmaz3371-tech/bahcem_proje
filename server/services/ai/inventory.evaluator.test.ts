/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/inventory.evaluator.test.ts */

import { describe, it } from "vitest";
import { InventoryEvaluator } from "./inventory.evaluator";
import { InventoryItemRepository } from "../../repositories/inventory.repository";
import { InventoryItem } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

class MockInventoryItemRepository extends InventoryItemRepository {
  constructor(private readonly mockItems: InventoryItem[]) { super(); }
  public async getAll(): Promise<InventoryItem[]> { return this.mockItems; }
}

async function main() {
  const healthyItem: InventoryItem = {
    id: "item-1", categoryId: "cat-1", name: "Sağlıklı Stok", stockQuantity: 10, unit: "Litre",
    minStockAlert: 2, unitPrice: 100, createdAt: "", updatedAt: "",
  };
  const criticalItem: InventoryItem = {
    id: "item-2", categoryId: "cat-1", name: "Kritik Stok", stockQuantity: 1, unit: "Litre",
    minStockAlert: 5, unitPrice: 100, createdAt: "", updatedAt: "",
  };

  console.log("=== supports() (regresyon) ===");
  const evaluator = new InventoryEvaluator(new MockInventoryItemRepository([healthyItem, criticalItem]));
  check("inventoryItemIds varsa supports=true", evaluator.supports({ inventoryItemIds: ["item-1"] }));
  check("inventoryItemIds yoksa supports=false", !evaluator.supports({}));

  console.log("\n=== evaluate() — ürün bulunamıyor (regresyon) ===");
  const emptyEvaluator = new InventoryEvaluator(new MockInventoryItemRepository([]));
  const resultMissing = await emptyEvaluator.evaluate({ inventoryItemIds: ["item-999"] });
  check("Ürün bulunamayınca FAIL", resultMissing.status === "FAIL");
  check("blocking=true", resultMissing.blocking === true);

  console.log("\n=== YENİ: evaluate() — stok SAĞLIKLI (yeterli miktar) ===");
  const resultHealthy = await evaluator.evaluate({ inventoryItemIds: ["item-1"] });
  check("Stok sağlıklıysa PASS", resultHealthy.status === "PASS");
  check("Stok sağlıklıysa blocking=false", resultHealthy.blocking === false);

  console.log("\n=== YENİ: evaluate() — stok KRİTİK EŞİĞİN ALTINDA ===");
  const resultCritical = await evaluator.evaluate({ inventoryItemIds: ["item-2"] });
  check("Stok kritikse FAIL", resultCritical.status === "FAIL");
  check("Stok kritikse blocking=true", resultCritical.blocking === true);
  check("Kritik ürün evidence'da", resultCritical.evidence?.some((e) => e.includes("Kritik Stok")));

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) throw new Error(`${failed} test başarısız oldu`);
}

describe("inventory.evaluator", () => {
  it("mevcut senaryo doğrulamalarının tümünü PASS ile geçer", async () => {
    await main();
  });
});
