/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7E — ProductAnalysisService Test Süiti.
 *
 * `VisionService`'in KENDİSİ sahte değil — `VisionService`'in
 * constructor'ına, Sprint 7D'nin kendi test dosyasındaki (`FakeVisionProvider`)
 * ile aynı desende bir sahte `VisionProvider` enjekte edilir. Bu, "Sprint
 * 7D'deki VisionService yeniden kullanılacak" gereğine sadık kalarak,
 * gerçek `VisionService` sınıfının GERÇEKTEN çalıştığını (mock'lanmadığını)
 * doğrular — yalnızca en dıştaki ağ bağımlılığı (Gemini) sahteleştirilir.
 */

import { describe, it, expect } from "vitest";
import { ProductAnalysisService } from "./product-analysis.service";
import { VisionService } from "./vision/vision.service";
import { VisionProvider, VisionImageInput } from "./vision/vision.types";
import { UploadedImageFile } from "./vision/image-validation.util";
import { LabelExtractionService } from "./label-extraction.service";

class FakeVisionProvider implements VisionProvider {
  constructor(
    private readonly behavior:
      | { mode: "success"; responseText: string }
      | { mode: "failure"; error: Error }
  ) {}

  public async analyzeImage(_prompt: string, _image: VisionImageInput): Promise<string> {
    if (this.behavior.mode === "failure") {
      throw this.behavior.error;
    }
    return this.behavior.responseText;
  }
}

/** Sprint 7G: LabelExtractionService de aynı VisionProvider arayüzünü kullanıyor — testlerde nötr (boş sonuç) bir sahte sağlayıcı yeterli, bu testlerin odağı structuredExtraction DEĞİL. */
function fakeLabelExtractionService(): LabelExtractionService {
  return new LabelExtractionService(new FakeVisionProvider({ mode: "success", responseText: "{}" }));
}

function validJpegFile(): UploadedImageFile {
  return { buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]), mimetype: "image/jpeg", size: 5 };
}

describe("ProductAnalysisService.analyzeProductPhoto", () => {
  it("[Başarılı analiz] Vision başarılı yanıt verirse -> ProductAnalysisResult DTO'su üretir (id/persistence alanı YOK)", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: '{"description": "Bir ilaç şişesi etiketi", "confidence": 0.85}' });
    const service = new ProductAnalysisService(new VisionService(provider), fakeLabelExtractionService());

    const outcome = await service.analyzeProductPhoto(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.description).toBe("Bir ilaç şişesi etiketi");
      expect(outcome.result.confidence).toBe(0.85);
      expect(outcome.result.detectedObjects).toEqual([]);
      expect(outcome.result.warnings).toEqual([]); // confidence eşiğin üzerinde, uyarı yok
      expect(outcome.result.rawResponse).toBeTruthy();
      expect((outcome.result as any).id).toBeUndefined(); // DTO, entity DEĞİL
    }
  });

  it("düşük confidence (<=0.6) -> warnings dizisi doldurulur", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: '{"description": "Belirsiz görüntü", "confidence": 0.3}' });
    const service = new ProductAnalysisService(new VisionService(provider), fakeLabelExtractionService());

    const outcome = await service.analyzeProductPhoto(validJpegFile());

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("[Vision servis hatası] sağlayıcı hata fırlatırsa -> throw ETMEZ, success:false döner", async () => {
    const provider = new FakeVisionProvider({ mode: "failure", error: new Error("Sağlayıcı hatası (simüle edilmiş)") });
    const service = new ProductAnalysisService(new VisionService(provider), fakeLabelExtractionService());

    const outcome = await service.analyzeProductPhoto(validJpegFile());

    expect(outcome.success).toBe(false);
  });

  it("[Timeout / ağ hatası] sağlayıcı zaman aşımına uğrarsa (network timeout simülasyonu) -> düzgün hata döner, sistem çökmez", async () => {
    const provider = new FakeVisionProvider({ mode: "failure", error: new Error("ETIMEDOUT: network timeout") });
    const service = new ProductAnalysisService(new VisionService(provider), fakeLabelExtractionService());

    const outcome = await service.analyzeProductPhoto(validJpegFile());

    expect(outcome.success).toBe(false);
    if (outcome.success === false) {
      expect(outcome.errorMessage).toBeTruthy();
    }
  });

  it("[Geçersiz dosya] dosya null ise -> Vision sağlayıcısı hiç çağrılmaz, success:false döner", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: "{}" });
    const service = new ProductAnalysisService(new VisionService(provider), fakeLabelExtractionService());

    const outcome = await service.analyzeProductPhoto(null);

    expect(outcome.success).toBe(false);
  });

  it("[API başarısızlığı] sağlayıcı bozuk JSON döndürürse -> success:false döner", async () => {
    const provider = new FakeVisionProvider({ mode: "success", responseText: "gecersiz json {{{" });
    const service = new ProductAnalysisService(new VisionService(provider), fakeLabelExtractionService());

    const outcome = await service.analyzeProductPhoto(validJpegFile());

    expect(outcome.success).toBe(false);
  });
});
