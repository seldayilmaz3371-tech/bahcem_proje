/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../logger";
import { activityLogRepository } from "../../repositories/activity.repository";
import { fertilizerRepository, chemicalRepository } from "../../repositories/inventory.repository";
import { Fertilizer, Chemical } from "../../models";
import { ProductCreateRequest } from "./product-create-request.types";
import { toFertilizerCreationParams, toChemicalCreationParams } from "./product-create.mapper";
import { createSilentProductInventoryItem } from "./product-bank-inventory.util";
import { checkProductDuplicate, DuplicateWarning } from "./product-duplicate-check.util";

/**
 * Sprint 7F — Product Bank kayıt akışının orkestrasyon katmanı.
 * Route → **ProductCreateService** → Mapper + Repository → Database.
 * İş kuralları (validasyon, hangi repository'nin çağrılacağı, InventoryItem
 * oluşturma sırası) burada yaşar — route yalnızca bu servisi çağırır.
 *
 * Repository BYPASS EDİLMEDİ: hem yeni InventoryItem hem Fertilizer/
 * Chemical kaydı, mevcut `fertilizerRepository`/`chemicalRepository`/
 * `inventoryItemRepository` (createSilentProductInventoryItem üzerinden)
 * ile oluşturuluyor — hiçbir doğrudan veritabanı erişimi yok.
 */
export type ProductCreateOutcome =
  | { success: true; type: "Fertilizer" | "Chemical"; product: Fertilizer | Chemical; inventoryItemId: string; duplicateWarning: DuplicateWarning }
  | { success: false; errorMessage: string };

export class ProductCreateService {
  /**
   * Doğrular, gerekirse InventoryItem oluşturur (ADR-001/ADR-003 —
   * `createSilentProductInventoryItem`), mevcut dedup mantığını
   * (`checkProductDuplicate`, DEĞİŞTİRİLMEDEN) çağırır, ve entity'yi
   * kalıcı olarak kaydeder. Duplicate bulunsa BİLE kaydı reddetmez
   * (Sprint 7C'nin mevcut davranışı — yalnızca bilgi döner, karar
   * frontend'e bırakılır, bkz. Sprint 7F onay mesajı §1).
   */
  public async createFromRequest(request: ProductCreateRequest, userId: string): Promise<ProductCreateOutcome> {
    const validationError = this.validate(request);
    if (validationError) {
      return { success: false, errorMessage: validationError };
    }

    const inventoryItem = await createSilentProductInventoryItem(request.type, request.name, request.brand, request.unit);

    const duplicateWarning = await checkProductDuplicate(
      request.type,
      request.brand || "",
      { npkRatio: request.npkRatio },
      { activeIngredient: request.activeIngredient, concentration: request.concentration }
    );

    let product: Fertilizer | Chemical;
    if (request.type === "Fertilizer") {
      product = await fertilizerRepository.create(toFertilizerCreationParams(request, inventoryItem.id));
    } else {
      product = await chemicalRepository.create(toChemicalCreationParams(request, inventoryItem.id));
    }

    await activityLogRepository.writeLog(
      userId,
      "PRODUCT_CREATE_FROM_ANALYSIS",
      `AI analizinden sonra Ürün Bilgi Bankasına yeni ${request.type === "Fertilizer" ? "gübre" : "zirai ilaç"} eklendi: '${request.name}'`
    );

    logger.info("AI", `Product Bank kaydı analiz akışından oluşturuldu (id: ${product.id}, güven: ${request.sourceAnalysisConfidence ?? "belirtilmemiş"}).`);

    return { success: true, type: request.type, product, inventoryItemId: inventoryItem.id, duplicateWarning };
  }

  /**
   * Sprint 7C'nin mevcut `/api/products` route'undaki AYNI validasyon
   * kurallarını (değiştirmeden) uygular — yeni bir validasyon şeması
   * icat edilmedi.
   */
  private validate(request: ProductCreateRequest): string | null {
    if (request.type !== "Fertilizer" && request.type !== "Chemical") {
      return "type alanı zorunludur ve yalnızca 'Fertilizer' veya 'Chemical' olabilir.";
    }
    if (!request.name || typeof request.name !== "string" || !request.name.trim()) {
      return "Ürün adı zorunludur.";
    }
    if (!request.unit || typeof request.unit !== "string" || !request.unit.trim()) {
      return "Birim (unit) zorunludur.";
    }
    if (request.type === "Chemical" && (!request.activeIngredient || typeof request.activeIngredient !== "string" || !request.activeIngredient.trim())) {
      return "Zirai ilaçlar için etken madde (activeIngredient) zorunludur.";
    }
    return null;
  }
}

export const productCreateService = new ProductCreateService();
