/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { inventoryItemRepository, fertilizerRepository, chemicalRepository } from "../../repositories/inventory.repository";

/**
 * Sprint 7F — bu dosya, Sprint 7C'de `server.ts` içinde tanımlanmış
 * `checkProductDuplicate`/`getInventoryBrand`/`normalizeForDuplicateCheck`
 * fonksiyonlarının BİREBİR AYNISIdır — MANTIK TEK SATIR DEĞİŞMEDEN
 * buraya taşındı. Amaç: hem mevcut `/api/products` route'unun (server.ts)
 * hem yeni `ProductCreateService`'in (Sprint 7F) AYNI, PAYLAŞILAN
 * fonksiyonu çağırabilmesi — "yeni duplicate algoritması yazılmayacak"
 * talimatına sadık kalırken, doğru bağımlılık yönünü korumak (bir
 * servis dosyasının route dosyasını import etmesi ters bir bağımlılık
 * yönü olurdu, mevcut mimaride hiçbir serviste bu desen yok).
 */

/**
 * Bir gübre/ilaç kaydının markasını, mevcut `InventoryItem`'ından
 * (Fertilizer/Chemical'ın kendisinde `brand` alanı yok — bu bilgi
 * ADR-001 gereği her zaman var olan `InventoryItem`'da tutuluyor) okur.
 */
export async function getInventoryBrand(inventoryItemId: string): Promise<string> {
  const item = await inventoryItemRepository.getById(inventoryItemId);
  return (item?.brand || "").trim();
}

/** Türkçe-duyarlı, boşluk/case toleranslı karşılaştırma için normalize eder. */
export function normalizeForDuplicateCheck(value: string | undefined): string {
  return (value || "").toLocaleLowerCase("tr-TR").trim();
}

export interface DuplicateWarning {
  found: boolean;
  matchedProductId?: string;
  matchedProductName?: string;
}

/**
 * Architecture Freeze §3 (Product Fingerprint) kararına göre dedup
 * kontrolü: Fertilizer için Marka+NPK, Chemical için Marka+Etken
 * Madde+Konsantrasyon TAM eşleşmesi. Otomatik birleştirme YAPMAZ —
 * yalnızca bilgi döndürür (ADR gereği karar frontend'e bırakılıyor,
 * bkz. Sprint 7C madde 4).
 */
export async function checkProductDuplicate(
  type: "Fertilizer" | "Chemical",
  brand: string,
  fertilizerFields?: { npkRatio?: string },
  chemicalFields?: { activeIngredient?: string; concentration?: string }
): Promise<DuplicateWarning> {
  const normalizedBrand = normalizeForDuplicateCheck(brand);

  if (type === "Fertilizer") {
    const normalizedNpk = normalizeForDuplicateCheck(fertilizerFields?.npkRatio);
    const allFertilizers = await fertilizerRepository.getAll();
    for (const existing of allFertilizers) {
      if (normalizeForDuplicateCheck(existing.npkRatio) !== normalizedNpk) continue;
      const existingBrand = normalizeForDuplicateCheck(await getInventoryBrand(existing.inventoryItemId));
      if (existingBrand === normalizedBrand) {
        const inventoryItem = await inventoryItemRepository.getById(existing.inventoryItemId);
        return { found: true, matchedProductId: existing.id, matchedProductName: inventoryItem?.name };
      }
    }
    return { found: false };
  }

  const normalizedActiveIngredient = normalizeForDuplicateCheck(chemicalFields?.activeIngredient);
  const normalizedConcentration = normalizeForDuplicateCheck(chemicalFields?.concentration);
  const allChemicals = await chemicalRepository.getAll();
  for (const existing of allChemicals) {
    if (normalizeForDuplicateCheck(existing.activeIngredient) !== normalizedActiveIngredient) continue;
    if (normalizeForDuplicateCheck(existing.concentration) !== normalizedConcentration) continue;
    const existingBrand = normalizeForDuplicateCheck(await getInventoryBrand(existing.inventoryItemId));
    if (existingBrand === normalizedBrand) {
      const inventoryItem = await inventoryItemRepository.getById(existing.inventoryItemId);
      return { found: true, matchedProductId: existing.id, matchedProductName: inventoryItem?.name };
    }
  }
  return { found: false };
}
