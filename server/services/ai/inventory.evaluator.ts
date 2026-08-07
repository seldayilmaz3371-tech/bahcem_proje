/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";
import { InventoryItemRepository } from "../../repositories/inventory.repository";

/**
 * Sprint 5E — Rule Evaluation. Artık yalnızca ürünlerin KAYITLI olup
 * olmadığını değil, `stockQuantity`'nin `minStockAlert`'in ÜZERİNDE
 * olup olmadığını (gerçek stok yeterliliği) değerlendiriyor.
 */
export class InventoryEvaluator extends BaseEvaluator {
  public readonly name = "InventoryEvaluator";

  constructor(private readonly inventoryItemRepository: InventoryItemRepository) {
    super();
  }

  public supports(context: EvaluatorContext): boolean {
    return !!context.inventoryItemIds && context.inventoryItemIds.length > 0;
  }

  protected async doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    const ids = context.inventoryItemIds ?? [];
    const allItems = await this.inventoryItemRepository.getAll();

    const missing = ids.filter((id) => !allItems.some((item) => item.id === id));
    if (missing.length > 0) {
      return {
        status: "FAIL",
        priority: "HIGH",
        blocking: true,
        reason: `${missing.length}/${ids.length} ürün envanterde hiç kayıtlı değil.`,
        metadata: { loadedRuleCount: allItems.length, activeRuleCount: ids.length - missing.length },
      };
    }

    const foundItems = ids.map((id) => allItems.find((item) => item.id === id)!);
    // ADR-003: yalnızca gerçek stok takibi yapılan (trackStock === true)
    // ürünler stok yeterliliği değerlendirmesine dahil edilir. AI Ürün
    // Bilgi Bankası kayıtları (trackStock === false) için "stok
    // yetersiz" kavramı anlamsızdır — bu ürünler değerlendirme dışında
    // bırakılır (ne PASS'e ne FAIL'e katkı yapar), böylece Decision
    // Engine bu ürünleri stok gerekçesiyle YANLIŞLIKLA engellemez.
    const belowCritical = foundItems.filter((item) => item.trackStock === true && item.stockQuantity <= item.minStockAlert);

    return {
      status: belowCritical.length === 0 ? "PASS" : "FAIL",
      priority: belowCritical.length === 0 ? "INFO" : "HIGH",
      blocking: belowCritical.length > 0,
      reason: belowCritical.length === 0
        ? `Tüm ${ids.length} ürünün stok seviyesi güvenli eşiğin üzerinde.`
        : `${belowCritical.length} ürünün stok seviyesi KRİTİK EŞİĞİN ALTINDA (veya eşitinde).`,
      evidence: belowCritical.map((item) => `${item.name}: ${item.stockQuantity} ${item.unit} (kritik: ${item.minStockAlert} ${item.unit})`),
      metadata: { loadedRuleCount: allItems.length, activeRuleCount: ids.length },
    };
  }
}
