/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7F — ProductCreateService Test Süiti.
 *
 * Repository'ler, mevcut Sprint 6B/6C deseniyle (`vi.mock`, gerçek
 * database.ts hiç tetiklenmez) izole edilir. `checkProductDuplicate` ve
 * `createSilentProductInventoryItem` GERÇEK (mock'lanmamış) — bunlar
 * "değiştirilmeden yeniden kullanılan" mevcut mantık olduğu için, testin
 * KENDİSİ bu yeniden kullanımın gerçekten çalıştığını kanıtlamalı.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repositories/inventory.repository", () => ({
  inventoryItemRepository: {
    create: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
  },
  fertilizerRepository: {
    create: vi.fn(),
    getAll: vi.fn(),
  },
  chemicalRepository: {
    create: vi.fn(),
    getAll: vi.fn(),
  },
}));

vi.mock("../../repositories/activity.repository", () => ({
  activityLogRepository: {
    writeLog: vi.fn().mockResolvedValue({}),
  },
}));

import { ProductCreateService } from "./product-create.service";
import { ProductCreateRequest } from "./product-create-request.types";
import { inventoryItemRepository, fertilizerRepository, chemicalRepository } from "../../repositories/inventory.repository";
import { activityLogRepository } from "../../repositories/activity.repository";

const mockInventoryItemRepository = vi.mocked(inventoryItemRepository);
const mockFertilizerRepository = vi.mocked(fertilizerRepository);
const mockChemicalRepository = vi.mocked(chemicalRepository);
const mockActivityLogRepository = vi.mocked(activityLogRepository);

beforeEach(() => {
  vi.clearAllMocks();
  mockFertilizerRepository.getAll.mockResolvedValue([]);
  mockChemicalRepository.getAll.mockResolvedValue([]);
});

function validChemicalRequest(overrides: Partial<ProductCreateRequest> = {}): ProductCreateRequest {
  return {
    type: "Chemical",
    name: "Test İlacı",
    brand: "TestMarka",
    unit: "Litre",
    activeIngredient: "Bakır Sülfat",
    concentration: "%25",
    ...overrides,
  };
}

describe("ProductCreateService.createFromRequest", () => {
  it("[Başarılı kayıt] geçerli Chemical isteği -> InventoryItem (trackStock:false) + Chemical (userConfirmed:true) oluşturur", async () => {
    const service = new ProductCreateService();
    mockInventoryItemRepository.create.mockResolvedValue({
      id: "inv-1", categoryId: "cat-pesticide", name: "Test İlacı", stockQuantity: 0, unit: "Litre",
      minStockAlert: 0, unitPrice: 0, trackStock: false, createdAt: "", updatedAt: "",
    });
    mockChemicalRepository.create.mockResolvedValue({
      id: "chem-1", inventoryItemId: "inv-1", activeIngredient: "Bakır Sülfat", targetPests: [], preHarvestIntervalDays: 0,
    });

    const outcome = await service.createFromRequest(validChemicalRequest({ sourceAnalysisConfidence: 0.8 }), "user-1");

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.type).toBe("Chemical");
      expect(outcome.inventoryItemId).toBe("inv-1");
    }
    // ADR-001/ADR-003: InventoryItem otomatik, sessiz, trackStock:false
    expect(mockInventoryItemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ stockQuantity: 0, trackStock: false, categoryId: "cat-pesticide" })
    );
    // userConfirmed her zaman true, aiExtractedLabel sourceAnalysisConfidence'tan dolduruldu
    expect(mockChemicalRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userConfirmed: true,
        aiExtractedLabel: expect.objectContaining({ confidence: 0.8 }),
      })
    );
    expect(mockActivityLogRepository.writeLog).toHaveBeenCalled();
  });

  it("[Kullanıcı düzenledikten sonra kayıt] AI'ın hiç önermediği alanlar (brand, activeIngredient) kullanıcı tarafından dolduruldu -> aynı şekilde kaydedilir", async () => {
    const service = new ProductCreateService();
    mockInventoryItemRepository.create.mockResolvedValue({
      id: "inv-2", categoryId: "cat-fertilizer", name: "Kullanıcı Düzenlemesi", stockQuantity: 0, unit: "Kg",
      minStockAlert: 0, unitPrice: 0, trackStock: false, createdAt: "", updatedAt: "",
    });
    mockFertilizerRepository.create.mockResolvedValue({
      id: "fert-1", inventoryItemId: "inv-2", npkRatio: "20-20-20",
    });

    // sourceAnalysisConfidence YOK — kullanıcı, AI'ın hiç önermediği bu
    // alanları (npkRatio dahil) sıfırdan doldurdu.
    const outcome = await service.createFromRequest(
      { type: "Fertilizer", name: "Kullanıcı Düzenlemesi", unit: "Kg", npkRatio: "20-20-20" },
      "user-1"
    );

    expect(outcome.success).toBe(true);
    expect(mockFertilizerRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ npkRatio: "20-20-20", aiExtractedLabel: undefined })
    );
  });

  it("[Duplicate ürün] aynı marka+etken madde+konsantrasyon -> duplicateWarning.found:true DÖNER, kayıt YİNE DE OLUŞUR (reddedilmez — Sprint 7C mantığı değiştirilmedi)", async () => {
    const service = new ProductCreateService();
    mockChemicalRepository.getAll.mockResolvedValue([
      { id: "existing-chem", inventoryItemId: "existing-inv", activeIngredient: "Bakır Sülfat", concentration: "%25", targetPests: [], preHarvestIntervalDays: 0 },
    ]);
    mockInventoryItemRepository.getById.mockResolvedValue({
      id: "existing-inv", categoryId: "cat-pesticide", name: "Mevcut Ürün", brand: "TestMarka", stockQuantity: 0, unit: "Litre",
      minStockAlert: 0, unitPrice: 0, trackStock: false, createdAt: "", updatedAt: "",
    });
    mockInventoryItemRepository.create.mockResolvedValue({
      id: "inv-3", categoryId: "cat-pesticide", name: "Test İlacı", stockQuantity: 0, unit: "Litre",
      minStockAlert: 0, unitPrice: 0, trackStock: false, createdAt: "", updatedAt: "",
    });
    mockChemicalRepository.create.mockResolvedValue({
      id: "chem-2", inventoryItemId: "inv-3", activeIngredient: "Bakır Sülfat", targetPests: [], preHarvestIntervalDays: 0,
    });

    const outcome = await service.createFromRequest(validChemicalRequest(), "user-1");

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.duplicateWarning.found).toBe(true);
      expect(outcome.duplicateWarning.matchedProductId).toBe("existing-chem");
    }
    // Kayıt YİNE DE oluşturuldu — reddedilmedi
    expect(mockChemicalRepository.create).toHaveBeenCalled();
  });

  it("[Validation hatası] type eksikse -> success:false, hiçbir repository çağrılmaz", async () => {
    const service = new ProductCreateService();
    const outcome = await service.createFromRequest({ name: "X", unit: "Litre" } as ProductCreateRequest, "user-1");

    expect(outcome.success).toBe(false);
    expect(mockInventoryItemRepository.create).not.toHaveBeenCalled();
  });

  it("[Validation hatası] Chemical + activeIngredient eksikse -> success:false", async () => {
    const service = new ProductCreateService();
    const outcome = await service.createFromRequest({ type: "Chemical", name: "X", unit: "Litre" }, "user-1");

    expect(outcome.success).toBe(false);
    expect(mockInventoryItemRepository.create).not.toHaveBeenCalled();
  });

  it("[Repository hatası] inventoryItemRepository.create reddedilirse -> throw yukarı fırlatılır (route asyncHandler tarafından yakalanır)", async () => {
    const service = new ProductCreateService();
    mockInventoryItemRepository.create.mockRejectedValue(new Error("Disk yazma hatası (simüle edilmiş)"));

    await expect(service.createFromRequest(validChemicalRequest(), "user-1")).rejects.toThrow("Disk yazma hatası");
  });

  it("[API hata yönetimi] chemicalRepository.create reddedilirse -> throw yukarı fırlatılır", async () => {
    const service = new ProductCreateService();
    mockInventoryItemRepository.create.mockResolvedValue({
      id: "inv-4", categoryId: "cat-pesticide", name: "X", stockQuantity: 0, unit: "Litre",
      minStockAlert: 0, unitPrice: 0, trackStock: false, createdAt: "", updatedAt: "",
    });
    mockChemicalRepository.create.mockRejectedValue(new Error("Kayıt hatası (simüle edilmiş)"));

    await expect(service.createFromRequest(validChemicalRequest(), "user-1")).rejects.toThrow("Kayıt hatası");
  });
});
