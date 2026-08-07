/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7G — LabelExtractionService Test Süiti.
 *
 * Sahte bir `VisionProvider` enjekte edilir (Sprint 7D/7E ile aynı desen)
 * — gerçek Gemini çağrısı yapılmaz.
 */

import { describe, it, expect } from "vitest";
import { LabelExtractionService } from "./label-extraction.service";
import { VisionProvider, VisionImageInput } from "./vision/vision.types";
import { UploadedImageFile } from "./vision/image-validation.util";

class FakeVisionProvider implements VisionProvider {
  constructor(
    private readonly behavior:
      | { mode: "success"; responseText: string }
      | { mode: "failure"; error: Error }
  ) {}

  public async analyzeImage(_prompt: string, _image: VisionImageInput): Promise<string> {
    if (this.behavior.mode === "failure") throw this.behavior.error;
    return this.behavior.responseText;
  }
}

function validJpegFile(): UploadedImageFile {
  return { buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]), mimetype: "image/jpeg", size: 5 };
}

describe("LabelExtractionService.extractLabel", () => {
  it("[Gübre etiketi doğru ayrıştırılıyor] npkRatio + brand + categorySuggestion:Fertilizer doğru çıkarılır", async () => {
    const service = new LabelExtractionService(
      new FakeVisionProvider({ mode: "success", responseText: '{"productName":"Süper Gübre","brand":"TarımMarka","categorySuggestion":"Fertilizer","npkRatio":"20-20-20","manufacturer":"XYZ Tarım A.Ş."}' })
    );

    const outcome = await service.extractLabel(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.npkRatio).toBe("20-20-20");
      expect(outcome.result.categorySuggestion).toBe("Fertilizer");
      expect(outcome.result.brand).toBe("TarımMarka");
    }
  });

  it("[İlaç etiketi doğru ayrıştırılıyor] activeIngredient + concentration + categorySuggestion:Chemical doğru çıkarılır", async () => {
    const service = new LabelExtractionService(
      new FakeVisionProvider({ mode: "success", responseText: '{"productName":"Test İlacı","brand":"İlaçMarka","categorySuggestion":"Chemical","activeIngredient":"Bakır Sülfat","concentration":"%25","formulation":"WP"}' })
    );

    const outcome = await service.extractLabel(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.activeIngredient).toBe("Bakır Sülfat");
      expect(outcome.result.concentration).toBe("%25");
      expect(outcome.result.formulation).toBe("WP");
      expect(outcome.result.categorySuggestion).toBe("Chemical");
    }
  });

  it("[Eksik etiket] yalnızca bazı alanlar okunabildiğinde, okunamayanlar undefined kalır (tahmin YAPILMAZ)", async () => {
    const service = new LabelExtractionService(
      new FakeVisionProvider({ mode: "success", responseText: '{"brand":"YalnızcaMarkaOkundu"}' })
    );

    const outcome = await service.extractLabel(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.brand).toBe("YalnızcaMarkaOkundu");
      expect(outcome.result.activeIngredient).toBeUndefined();
      expect(outcome.result.npkRatio).toBeUndefined();
      expect(outcome.result.productName).toBeUndefined();
    }
  });

  it("[Düşük confidence / etiket değil] Gemini boş obje döndürürse TÜM alanlar undefined kalır, hata değildir", async () => {
    const service = new LabelExtractionService(new FakeVisionProvider({ mode: "success", responseText: "{}" }));

    const outcome = await service.extractLabel(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(Object.values(outcome.result).every((v) => v === undefined)).toBe(true);
    }
  });

  it("[OCR başarısız] sağlayıcı hata fırlatırsa -> throw ETMEZ, success:false döner", async () => {
    const service = new LabelExtractionService(new FakeVisionProvider({ mode: "failure", error: new Error("Simüle edilmiş sağlayıcı hatası") }));

    const outcome = await service.extractLabel(validJpegFile());

    expect(outcome.success).toBe(false);
  });

  it("[OCR boş dönüyor] bozuk/boş JSON yanıtı -> success:false döner, sistem çökmez", async () => {
    const service = new LabelExtractionService(new FakeVisionProvider({ mode: "success", responseText: "" }));

    const outcome = await service.extractLabel(validJpegFile());

    expect(outcome.success).toBe(false);
  });

  it("categorySuggestion şema dışı bir değer içerirse (örn. 'Unknown') -> alan undefined'a düşer, hata fırlatmaz", async () => {
    const service = new LabelExtractionService(
      new FakeVisionProvider({ mode: "success", responseText: '{"categorySuggestion":"Unknown","brand":"Test"}' })
    );

    const outcome = await service.extractLabel(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.categorySuggestion).toBeUndefined();
      expect(outcome.result.brand).toBe("Test");
    }
  });

  it("[Geçersiz dosya] dosya null ise -> sağlayıcı hiç çağrılmaz, success:false döner", async () => {
    const service = new LabelExtractionService(new FakeVisionProvider({ mode: "success", responseText: "{}" }));

    const outcome = await service.extractLabel(null);

    expect(outcome.success).toBe(false);
  });

  it("importantWarnings dizisi doğru çıkarılır", async () => {
    const service = new LabelExtractionService(
      new FakeVisionProvider({ mode: "success", responseText: '{"importantWarnings":["Gözle temas ettirmeyiniz","Çocuklardan uzak tutunuz"]}' })
    );

    const outcome = await service.extractLabel(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.importantWarnings).toEqual(["Gözle temas ettirmeyiniz", "Çocuklardan uzak tutunuz"]);
    }
  });
});
