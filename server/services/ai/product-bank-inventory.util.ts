/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { inventoryItemRepository } from "../../repositories/inventory.repository";
import { InventoryItem } from "../../models";

/**
 * Sprint 7F — küçük, davranış-koruyucu bir "extract function" işlemi.
 *
 * Bu fonksiyon, Sprint 7C'nin `POST /api/products` route'undaki (server.ts)
 * InventoryItem oluşturma bloğunun BİREBİR AYNISIdır — hiçbir değer, sıra
 * veya varsayılan DEĞİŞTİRİLMEDEN buraya taşındı. Amaç: Sprint 7F'nin yeni
 * `/api/products/from-analysis` akışının da AYNI mantığı, KOPYALAMADAN
 * kullanabilmesi (bkz. Sprint 7F onay mesajı, "Değerlendirme 1").
 *
 * ADR-001 (otomatik/sessiz InventoryItem, stockQuantity=0) ve ADR-003
 * (trackStock=false) kararlarının TEK, PAYLAŞILAN uygulama noktasıdır.
 */
export async function createSilentProductInventoryItem(
  type: "Fertilizer" | "Chemical",
  name: string,
  brand: string | undefined,
  unit: string
): Promise<InventoryItem> {
  const categoryId = type === "Fertilizer" ? "cat-fertilizer" : "cat-pesticide";
  return inventoryItemRepository.create({
    name: name.trim(),
    categoryId,
    brand: (brand || "").trim() || undefined,
    stockQuantity: 0,
    unit: unit.trim(),
    minStockAlert: 0,
    unitPrice: 0,
    trackStock: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
