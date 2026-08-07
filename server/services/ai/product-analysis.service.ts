/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LOW_CONFIDENCE_THRESHOLD } from "../growth-scoring.util";
import { VisionService, visionService } from "./vision/vision.service";
import { UploadedImageFile } from "./vision/image-validation.util";
import { ProductAnalysisResult } from "./product-analysis.types";
import { LabelExtractionService, labelExtractionService } from "./label-extraction.service";

/**
 * Sprint 7E — AI Vision → Product Analysis akışı.
 *
 * Bu servis, Sprint 7D'nin `VisionService`'ini DOĞRUDAN, hiç
 * değiştirmeden yeniden kullanır (constructor injection — mevcut
 * projedeki Evaluator/Service enjeksiyon deseniyle tutarlı) ve onun
 * genel amaçlı çıktısını, "ürün analizi" bağlamına özgü bir DTO'ya
 * (`ProductAnalysisResult`) çevirir. **Yeni bir Gemini entegrasyonu
 * içermiyor** — tek sorumluluğu, mevcut Vision sonucunu farklı bir
 * şekle dönüştürmek (mapping).
 *
 * Katmanlı mimari: Route → **ProductAnalysisService** → VisionService →
 * Vision Adapter → Gemini → Parser → DTO → Route → Frontend. Hiçbir
 * katman atlanmadı; bu servis, VisionService ile route arasına giren
 * YENİ, ince bir dönüştürme katmanıdır.
 *
 * Sprint 7G güncellemesi: `LabelExtractionService` (ayrı, bağımsız bir
 * servis — bkz. label-extraction.service.ts) da PARALEL (Promise.all)
 * çağrılıyor ve sonucu `structuredExtraction` alanına ekleniyor. İki
 * ayrı Gemini isteği anlamına geldiği bilinçli bir tercihtir (bkz.
 * Sprint Sonu Raporu, Risk Analizi) — sıralı değil paralel çalıştırarak
 * gecikme etkisi en aza indirildi. Etiket ayrıştırma BAŞARISIZ olsa
 * BİLE (ağ hatası, ayrıştırma hatası) genel analiz ETKİLENMEZ —
 * `structuredExtraction` yalnızca `undefined` kalır, ana akış kesintiye
 * uğramaz (bkz. Sprint 7G "OCR her alanı bulmak zorunda değildir").
 */
export type ProductAnalysisOutcome =
  | { success: true; result: ProductAnalysisResult }
  | { success: false; errorMessage: string };

export class ProductAnalysisService {
  constructor(
    private readonly visionService: VisionService,
    private readonly labelExtractionService: LabelExtractionService
  ) {}

  /**
   * Bir ürün fotoğrafını analiz eder ve sonucu `ProductAnalysisResult`
   * DTO'suna dönüştürür. Hiçbir veritabanı okuma/yazma işlemi yapmaz
   * (bkz. Sprint 7E kapsam sınırı). Asla throw etmez — VisionService'in
   * kendi `{success,result|errorMessage}` deseniyle birebir tutarlı.
   */
  public async analyzeProductPhoto(file: UploadedImageFile | null | undefined): Promise<ProductAnalysisOutcome> {
    const [visionOutcome, labelOutcome] = await Promise.all([
      this.visionService.analyze(file),
      this.labelExtractionService.extractLabel(file),
    ]);

    if (visionOutcome.success === false) {
      // Genel analiz başarısız olursa TÜM istek başarısız sayılır —
      // etiket ayrıştırma sonucu (varsa) önemsizdir, çünkü kullanıcıya
      // gösterilecek asıl "sonuç" (description/confidence) yok.
      return { success: false, errorMessage: visionOutcome.errorMessage };
    }

    const warnings: string[] = [];
    if (visionOutcome.result.confidence <= LOW_CONFIDENCE_THRESHOLD) {
      warnings.push("Bu analiz düşük güven düzeyinde — fotoğrafı daha net bir açıdan/ışıkta tekrar çekmeniz önerilir.");
    }

    const result: ProductAnalysisResult = {
      description: visionOutcome.result.description,
      confidence: visionOutcome.result.confidence,
      detectedObjects: [], // bkz. product-analysis.types.ts — mevcut Vision altyapısı henüz nesne tespiti üretmiyor
      warnings,
      rawResponse: JSON.stringify(visionOutcome.result),
      // Etiket ayrıştırma başarısız olduysa (labelOutcome.success===false)
      // structuredExtraction bilinçli olarak undefined kalır — genel
      // analiz sonucu YİNE DE kullanıcıya gösterilir (bkz. yukarı açıklama).
      structuredExtraction: labelOutcome.success ? labelOutcome.result : undefined,
    };

    return { success: true, result };
  }
}

/** Route katmanının doğrudan kullanacağı, mevcut Sprint 7D VisionService + Sprint 7G LabelExtractionService örnekleriyle önceden bağlanmış varsayılan örnek. */
export const productAnalysisService = new ProductAnalysisService(visionService, labelExtractionService);
