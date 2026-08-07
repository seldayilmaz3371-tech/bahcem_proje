/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7D — VisionService Test Süiti.
 *
 * `VisionProvider` arayüzünün sahte (fake) bir implementasyonu enjekte
 * edilir — gerçek Gemini API'sine hiç ağ çağrısı yapılmaz. Bu, mevcut
 * `BaseEvaluator` alt sınıflarının test edilme deseniyle (repository
 * mock'lama, constructor injection) tutarlıdır — `VisionService` de
 * aynı şekilde constructor injection kullanacak biçimde tasarlandı
 * (bkz. vision.service.ts).
 */

import { describe, it, expect } from "vitest";
import { VisionService } from "./vision.service";
import { VisionProvider, VisionImageInput } from "./vision.types";
import { UploadedImageFile } from "./image-validation.util";

class FakeVisionProvider implements VisionProvider {
  constructor(
    private readonly behavior:
      | { mode: "success"; responseText: string }
      | { mode: "failure"; error: Error }
  ) {}

  public callCount = 0;

  public async analyzeImage(_prompt: string, _image: VisionImageInput): Promise<string> {
    this.callCount++;
    if (this.behavior.mode === "failure") {
      throw this.behavior.error;
    }
    return this.behavior.responseText;
  }
}

function validJpegFile(): UploadedImageFile {
  return { buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]), mimetype: "image/jpeg", size: 5 };
}

describe("VisionService.analyze", () => {
  it("[Başarılı Vision çağrısı] geçerli dosya + sağlayıcı başarılı yanıt -> success:true, ayrıştırılmış sonuç döner", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: '{"description": "Sağlıklı bir zeytin yaprağı", "confidence": 0.9}' });
    const service = new VisionService(provider);

    const outcome = await service.analyze(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.description).toBe("Sağlıklı bir zeytin yaprağı");
      expect(outcome.result.confidence).toBe(0.9);
    }
    expect(provider.callCount).toBe(1);
  });

  it("[Başarısız Vision çağrısı] sağlayıcı hata fırlatırsa -> throw ETMEZ, success:false + anlamlı hata mesajı döner", async () => {
    const provider = new FakeVisionProvider({ mode: "failure", error: new Error("Gemini kota sınırı aşıldı (simüle edilmiş)") });
    const service = new VisionService(provider);

    const outcome = await service.analyze(validJpegFile());

    expect(outcome.success).toBe(false);
    if (outcome.success === false) {
      expect(outcome.errorMessage).toBeTruthy();
    }
  });

  it("[Geçersiz dosya] dosya null ise -> sağlayıcı HİÇ ÇAĞRILMAZ, success:false döner", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: "{}" });
    const service = new VisionService(provider);

    const outcome = await service.analyze(null);

    expect(outcome.success).toBe(false);
    expect(provider.callCount).toBe(0);
  });

  it("[Boş dosya] buffer.length === 0 ise -> sağlayıcı HİÇ ÇAĞRILMAZ, success:false döner", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: "{}" });
    const service = new VisionService(provider);

    const outcome = await service.analyze({ buffer: Buffer.from([]), mimetype: "image/jpeg", size: 0 });

    expect(outcome.success).toBe(false);
    expect(provider.callCount).toBe(0);
  });

  it("[Desteklenmeyen format] PDF gibi geçersiz bir mimetype ise -> sağlayıcı HİÇ ÇAĞRILMAZ, success:false döner", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: "{}" });
    const service = new VisionService(provider);

    const outcome = await service.analyze({ buffer: Buffer.from([1, 2, 3]), mimetype: "application/pdf", size: 3 });

    expect(outcome.success).toBe(false);
    expect(provider.callCount).toBe(0);
  });

  it("sağlayıcı bozuk JSON döndürürse -> success:false döner (throw etmez)", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: "bu gecerli bir json degil {{{" });
    const service = new VisionService(provider);

    const outcome = await service.analyze(validJpegFile());

    expect(outcome.success).toBe(false);
  });
});
