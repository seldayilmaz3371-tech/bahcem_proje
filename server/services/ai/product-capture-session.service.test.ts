/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 8 — ProductCaptureSessionService Test Süiti.
 *
 * Tüm bağımlılıklar (`vision.service`, `label-extraction.service`,
 * `product-create.service`, `document.service`, `photo-storage.service`,
 * repository'ler) `vi.mock()` ile izole edilir — mevcut Sprint 6B/7F/7H
 * deseniyle tutarlı, gerçek Gemini/DB'ye hiç dokunulmaz.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./vision/vision.service", () => ({ visionService: { analyze: vi.fn() } }));
vi.mock("./label-extraction.service", () => ({ labelExtractionService: { extractLabel: vi.fn() } }));
vi.mock("./product-create.service", () => ({ productCreateService: { createFromRequest: vi.fn() } }));
vi.mock("./document.service", () => ({ documentService: { processDocument: vi.fn() } }));
vi.mock("./document-text-extraction.util", () => ({ extractTextFromDocumentFile: vi.fn() }));
vi.mock("../photo-storage.service", () => ({ photoStorageService: { saveNewPhoto: vi.fn() } }));
vi.mock("../../repositories/inventory.repository", () => ({
  fertilizerRepository: { update: vi.fn() },
  chemicalRepository: { update: vi.fn() },
}));

import { ProductCaptureSessionService } from "./product-capture-session.service";
import { visionService } from "./vision/vision.service";
import { labelExtractionService } from "./label-extraction.service";
import { productCreateService } from "./product-create.service";
import { documentService } from "./document.service";
import { extractTextFromDocumentFile } from "./document-text-extraction.util";
import { photoStorageService } from "../photo-storage.service";
import { fertilizerRepository } from "../../repositories/inventory.repository";

const mockVision = vi.mocked(visionService);
const mockLabel = vi.mocked(labelExtractionService);
const mockCreate = vi.mocked(productCreateService);
const mockDocService = vi.mocked(documentService);
const mockExtractText = vi.mocked(extractTextFromDocumentFile);
const mockPhotoStorage = vi.mocked(photoStorageService);
const mockFertRepo = vi.mocked(fertilizerRepository);

beforeEach(() => vi.clearAllMocks());

function file(name: string): any {
  return { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: "image/jpeg", size: 3, originalname: name };
}

describe("ProductCaptureSessionService.analyzeImages", () => {
  it("[Tek fotoğraf] tek dosya doğru analiz edilir", async () => {
    mockVision.analyze.mockResolvedValue({ success: true, result: { description: "Bir gübre torbası", confidence: 0.8 } });
    mockLabel.extractLabel.mockResolvedValue({ success: true, result: { brand: "GÜBRETAŞ" } });

    const service = new ProductCaptureSessionService();
    const outcome = await service.analyzeImages([file("front.jpg")]);

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.structuredExtraction.brand).toBe("GÜBRETAŞ");
      expect(outcome.result.fileResults).toHaveLength(1);
      expect(outcome.result.fileResults[0].status).toBe("analyzed");
    }
  });

  it("[Çoklu fotoğraf + NPK farklı fotoğrafta + Kullanım tablosu farklı fotoğrafta] doğru birleştirilir", async () => {
    mockVision.analyze.mockResolvedValue({ success: true, result: { description: "Etiket fotoğrafı", confidence: 0.75 } });
    mockLabel.extractLabel
      .mockResolvedValueOnce({ success: true, result: { brand: "GÜBRETAŞ", productName: "10.5.40+ME" } })
      .mockResolvedValueOnce({ success: true, result: { npkRatio: "10-5-40" } })
      .mockResolvedValueOnce({ success: true, result: { importantWarnings: ["Çocuklardan uzak tutunuz"] } });

    const service = new ProductCaptureSessionService();
    const outcome = await service.analyzeImages([file("front.jpg"), file("back.jpg"), file("usage-table.jpg")]);

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.structuredExtraction.brand).toBe("GÜBRETAŞ");
      expect(outcome.result.structuredExtraction.npkRatio).toBe("10-5-40");
      expect(outcome.result.structuredExtraction.importantWarnings).toContain("Çocuklardan uzak tutunuz");
    }
  });

  it("[Hiç ürün adı bulunmaması] tüm fotoğraflar productName içermezse -> undefined kalır, HATA OLUŞMAZ", async () => {
    mockVision.analyze.mockResolvedValue({ success: true, result: { description: "Belirsiz bir görüntü", confidence: 0.4 } });
    mockLabel.extractLabel.mockResolvedValue({ success: true, result: {} });

    const service = new ProductCaptureSessionService();
    const outcome = await service.analyzeImages([file("blurry1.jpg"), file("blurry2.jpg")]);

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.structuredExtraction.productName).toBeUndefined();
    }
  });

  it("[Karışık dosya yükleme — bazı dosyalar başarısız] bir dosya başarısız olursa diğerleri etkilenmez", async () => {
    mockVision.analyze
      .mockResolvedValueOnce({ success: false, errorMessage: "Bozuk dosya" })
      .mockResolvedValueOnce({ success: true, result: { description: "Geçerli fotoğraf", confidence: 0.7 } });
    mockLabel.extractLabel.mockResolvedValue({ success: true, result: { brand: "TestMarka" } });

    const service = new ProductCaptureSessionService();
    const outcome = await service.analyzeImages([file("broken.jpg"), file("good.jpg")]);

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.fileResults.find((f) => f.fileName === "broken.jpg")?.status).toBe("failed");
      expect(outcome.result.fileResults.find((f) => f.fileName === "good.jpg")?.status).toBe("analyzed");
      expect(outcome.result.structuredExtraction.brand).toBe("TestMarka"); // başarılı dosyanın verisi kayboldu değil
    }
  });

  it("dosya listesi boşsa -> validation hatası", async () => {
    const service = new ProductCaptureSessionService();
    const outcome = await service.analyzeImages([]);
    expect(outcome.success).toBe(false);
  });

  it("tüm dosyalar başarısız olursa -> success:false döner", async () => {
    mockVision.analyze.mockResolvedValue({ success: false, errorMessage: "Hata" });
    const service = new ProductCaptureSessionService();
    const outcome = await service.analyzeImages([file("a.jpg"), file("b.jpg")]);
    expect(outcome.success).toBe(false);
  });
});

describe("ProductCaptureSessionService.saveSessionWithDocuments — [Product Bank] [Chunk] [Vector] [Index] [RAG]", () => {
  it("[Product Bank + Çoklu PDF (Belge listesi/Chunk/Vector/Index/RAG)] ürün oluşturulur, fotoğraflar+belgeler doğru indekslenir", async () => {
    mockCreate.createFromRequest.mockResolvedValue({
      success: true,
      type: "Chemical",
      product: { id: "prod-1", inventoryItemId: "inv-1", activeIngredient: "Test", targetPests: [], preHarvestIntervalDays: 0 },
      inventoryItemId: "inv-1",
      duplicateWarning: { found: false },
    });
    mockPhotoStorage.saveNewPhoto.mockReturnValue({ photoId: "photo-1", relativeUrl: "/photos/photo-1.jpg", fileSizeBytes: 100, contentHash: "hash1" });
    mockExtractText.mockResolvedValue("MSDS belge metni burada.");
    mockDocService.processDocument.mockResolvedValue({ id: "doc-1", fileName: "msds.pdf" } as any);
    mockFertRepo.update.mockResolvedValue({} as any);

    const service = new ProductCaptureSessionService();
    const outcome = await service.saveSessionWithDocuments(
      { type: "Chemical", name: "Test İlacı", unit: "Litre", activeIngredient: "Test" },
      "user-1",
      [file("front.jpg")],
      [
        { buffer: Buffer.from("pdf1"), mimetype: "application/pdf", originalname: "msds.pdf", documentCategory: "MSDS" },
        { buffer: Buffer.from("pdf2"), mimetype: "application/pdf", originalname: "teknik-fisi.pdf", documentCategory: "Teknik Föy" },
      ]
    );

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.photoCount).toBe(1);
      // [Belge listesi] Sprint 9.6: artık 4 = 1 ürün özeti + 1 fotoğraf(OCR, kök neden düzeltmesi) + 2 PDF
      expect(outcome.result.indexedDocuments).toHaveLength(4);
      expect(outcome.result.indexedDocuments.some((d) => d.documentCategory === "Ürün Özeti")).toBe(true);
      expect(outcome.result.indexedDocuments.some((d) => d.documentCategory === "Fotoğraf (OCR)")).toBe(true);
    }
    // [RAG/Index] documentService.processDocument, "product" + oluşturulan ürün id'siyle çağrıldı — hem özet hem PDF için
    expect(mockDocService.processDocument).toHaveBeenCalledWith(
      "user-1", "msds.pdf", "application/pdf", 4, "MSDS belge metni burada.", "product", "prod-1", undefined, "MSDS"
    );
    expect(mockDocService.processDocument).toHaveBeenCalledWith(
      "user-1", expect.stringContaining("Ürün Özeti"), "text/plain", expect.any(Number), expect.stringContaining("Test İlacı"), "product", "prod-1", undefined, "Ürün Özeti"
    );
  });

  it("ProductCreateService başarısız olursa -> belge/fotoğraf işleme HİÇ başlamaz", async () => {
    mockCreate.createFromRequest.mockResolvedValue({ success: false, errorMessage: "Validasyon hatası" });

    const service = new ProductCaptureSessionService();
    const outcome = await service.saveSessionWithDocuments({ type: "Chemical", name: "", unit: "" }, "user-1", [], []);

    expect(outcome.success).toBe(false);
    expect(mockExtractText).not.toHaveBeenCalled();
  });

  it("desteklenmeyen belge formatı -> skippedDocuments'e eklenir, kayıt YİNE DE başarılı olur", async () => {
    mockCreate.createFromRequest.mockResolvedValue({
      success: true, type: "Fertilizer",
      product: { id: "prod-2", inventoryItemId: "inv-2", npkRatio: "10-10-10" },
      inventoryItemId: "inv-2", duplicateWarning: { found: false },
    });
    mockExtractText.mockResolvedValue(null); // desteklenmeyen format

    const service = new ProductCaptureSessionService();
    const outcome = await service.saveSessionWithDocuments(
      { type: "Fertilizer", name: "Test", unit: "Kg" }, "user-1", [],
      [{ buffer: Buffer.from("x"), mimetype: "application/zip", originalname: "gereksiz.zip" }]
    );

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.skippedDocuments).toHaveLength(1);
      // 4. tur düzeltmesi: ürün özeti her zaman indekslenir (documentFiles'tan bağımsız) — desteklenmeyen belge AYRI olarak skippedDocuments'e düşer
      expect(outcome.result.indexedDocuments).toHaveLength(1);
      expect(outcome.result.indexedDocuments[0].documentCategory).toBe("Ürün Özeti");
    }
  });

  it("[GERÇEK KULLANICI SENARYOSU — 4. tur] yalnızca fotoğraf yüklendi, HİÇ PDF/belge yok -> ürün özeti YİNE DE RAG'e indekslenir (Belgelere Sor artık bir şey bulabilir)", async () => {
    mockCreate.createFromRequest.mockResolvedValue({
      success: true, type: "Fertilizer",
      product: { id: "prod-3", inventoryItemId: "inv-3", npkRatio: "10-5-40" },
      inventoryItemId: "inv-3", duplicateWarning: { found: false },
    });
    mockPhotoStorage.saveNewPhoto.mockReturnValue({ photoId: "photo-x", relativeUrl: "/photos/x.jpg", fileSizeBytes: 3, contentHash: "h" });
    mockDocService.processDocument.mockResolvedValue({ id: "summary-doc-1", fileName: "GÜBRETAŞ 10.5.40+ME — Ürün Özeti" } as any);
    mockFertRepo.update.mockResolvedValue({} as any);

    const service = new ProductCaptureSessionService();
    const outcome = await service.saveSessionWithDocuments(
      { type: "Fertilizer", name: "10.5.40+ME", brand: "GÜBRETAŞ", unit: "Kg", npkRatio: "10-5-40" },
      "user-1",
      [file("on-etiket.jpg"), file("garanti-icerik.jpg"), file("kullanim-onerileri.jpg")],
      [] // HİÇ belge/PDF yok — kullanıcının gerçek testi bu şekildeydi
    );

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.photoCount).toBe(3);
      // DÜZELTME ÖNCESİ: bu 0 olurdu (hiç PDF yok), "Belgelere Sor" hiçbir şey bulamazdı.
      // DÜZELTME SONRASI: en az 1 (ürün özeti) indekslenir.
      expect(outcome.result.indexedDocuments.length).toBeGreaterThanOrEqual(1);
      expect(outcome.result.indexedDocuments[0].documentCategory).toBe("Ürün Özeti");
    }
    expect(mockDocService.processDocument).toHaveBeenCalledWith(
      "user-1", expect.stringContaining("Ürün Özeti"), "text/plain", expect.any(Number),
      expect.stringMatching(/GÜBRETAŞ.*10\.5\.40\+ME|10\.5\.40\+ME.*GÜBRETAŞ/s),
      "product", "prod-3", undefined, "Ürün Özeti"
    );
  });
});
