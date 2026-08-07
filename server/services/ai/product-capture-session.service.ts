/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../logger";
import { visionService } from "./vision/vision.service";
import { labelExtractionService } from "./label-extraction.service";
import { UploadedImageFile, validateImageFile } from "./vision/image-validation.util";
import { mergeStructuredExtractions } from "./product-capture-session.merge";
import { StructuredLabelExtraction } from "../../prompts/label-extraction.prompt";
import { productCreateService, ProductCreateOutcome } from "./product-create.service";
import { ProductCreateRequest } from "./product-create-request.types";
import { documentService } from "./document.service";
import { extractTextFromDocumentFile } from "./document-text-extraction.util";
import { photoStorageService } from "../photo-storage.service";
import { fertilizerRepository, chemicalRepository } from "../../repositories/inventory.repository";

/**
 * Sprint 8 — Product Capture Session.
 *
 * Bu servis, MEVCUT, DEĞİŞTİRİLMEMİŞ servisleri (VisionService,
 * LabelExtractionService, ProductCreateService, DocumentService,
 * PhotoStorageService) BİRDEN FAZLA dosya üzerinde ORKESTRE EDER —
 * hiçbiri kendi içinde değiştirilmedi, yalnızca DÖNGÜYLE tekrar tekrar
 * çağrılıyor ve sonuçları BİRLEŞTİRİLİYOR.
 *
 * STATELESS TASARIM (bilinçli karar): "Session" kavramı, backend'de
 * KALICI bir varlık/repository DEĞİLDİR — yalnızca TEK bir HTTP isteği
 * ömrü boyunca var olan bir dosya kümesidir. Bu, "Repository mimarisi
 * değişmeyecek" kısıtına tam uyar (yeni bir repository/şema gerekmez) ve
 * "gereksiz karmaşıklık oluşturma" ilkesine sadıktır. Analiz (`analyzeImages`)
 * ve kayıt (`saveSessionWithDocuments`) İKİ AYRI istek olarak tasarlandı;
 * frontend, kullanıcının seçtiği dosyaları (File[]) tarayıcı belleğinde
 * tutar ve gerektiğinde ikinci isteğe TEKRAR gönderir — mevcut Sprint
 * 7E/7F akışının doğal bir uzantısıdır, yeni bir persistans mekanizması
 * icat edilmedi.
 */

export interface CaptureFileAnalysisEntry {
  fileName: string;
  status: "analyzed" | "failed";
  errorMessage?: string;
}

export interface ProductCaptureAnalysisResult {
  description: string;
  confidence: number;
  structuredExtraction: StructuredLabelExtraction;
  fileResults: CaptureFileAnalysisEntry[];
}

export type ProductCaptureAnalysisOutcome =
  | { success: true; result: ProductCaptureAnalysisResult }
  | { success: false; errorMessage: string };

export interface DocumentFileInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  documentCategory?: string;
}

export interface ProductCaptureSaveResult {
  createOutcome: Extract<ProductCreateOutcome, { success: true }>;
  photoCount: number;
  indexedDocuments: { id: string; fileName: string; documentCategory?: string }[];
  skippedDocuments: { fileName: string; reason: string }[];
}

export type ProductCaptureSaveOutcome =
  | { success: true; result: ProductCaptureSaveResult }
  | { success: false; errorMessage: string };

export class ProductCaptureSessionService {
  /**
   * Bir Product Capture Session'daki TÜM görsel dosyaları analiz eder
   * (her biri VisionService + LabelExtractionService ile AYRI AYRI,
   * PARALEL) ve sonuçları TEK bir `ProductCaptureAnalysisResult`'a
   * birleştirir (bkz. product-capture-session.merge.ts). Bir dosyanın
   * analizi başarısız olsa BİLE (bozuk/geçersiz dosya) diğerleri
   * etkilenmez — `fileResults` içinde ayrıca raporlanır (bkz. Sprint 8
   * "Önemli Kural": eksik bilgi hata değildir).
   */
  public async analyzeImages(imageFiles: UploadedImageFile[]): Promise<ProductCaptureAnalysisOutcome> {
    if (imageFiles.length === 0) {
      return { success: false, errorMessage: "En az bir fotoğraf seçmelisiniz." };
    }

    const perFile = await Promise.all(
      imageFiles.map(async (file, index) => {
        const fileName = file.originalname || `fotoğraf-${index + 1}`;
        const validation = validateImageFile(file);
        if (!validation.valid) {
          return { fileName, status: "failed" as const, errorMessage: validation.errorMessage, description: null, confidence: 0, extraction: null };
        }

        const [visionOutcome, labelOutcome] = await Promise.all([visionService.analyze(file), labelExtractionService.extractLabel(file)]);

        if (visionOutcome.success === false) {
          logger.error("AI", `Capture session: ${fileName} için Vision analizi başarısız.`, visionOutcome.errorMessage);
          return { fileName, status: "failed" as const, errorMessage: visionOutcome.errorMessage, description: null, confidence: 0, extraction: null };
        }

        // Sprint 8 — 3. tur düzeltmesi: `labelOutcome` başarısız olduğunda
        // ÖNCEDEN hiçbir log YOKTU — bu, "structuredExtraction neden boş
        // geliyor" sorusunun teşhisini İMKANSIZ kılıyordu (sessizce {}'e
        // düşüyordu). VisionOutcome ile AYNI, mevcut log deseni burada da
        // uygulanıyor — davranış DEĞİŞMEDİ (yine {} ile devam eder, genel
        // analiz kesintiye uğramaz), yalnızca GÖZLEMLENEBİLİRLİK eklendi.
        if (labelOutcome.success === false) {
          logger.error("AI", `Capture session: ${fileName} için etiket ayrıştırma (LabelExtraction) başarısız.`, labelOutcome.errorMessage);
        }

        return {
          fileName,
          status: "analyzed" as const,
          errorMessage: undefined,
          description: visionOutcome.result.description,
          confidence: visionOutcome.result.confidence,
          extraction: labelOutcome.success ? labelOutcome.result : ({} as StructuredLabelExtraction),
        };
      })
    );

    const successfulEntries = perFile.filter((e) => e.status === "analyzed");
    if (successfulEntries.length === 0) {
      return { success: false, errorMessage: "Hiçbir fotoğraf analiz edilemedi." };
    }

    const mergedExtraction = mergeStructuredExtractions(successfulEntries.map((e) => e.extraction!));
    // Genel açıklama: ilk BAŞARILI analizin açıklaması (birden fazla
    // fotoğrafın serbest-metin açıklamasını birleştirmek anlamsız bir
    // metin yığını üretirdi — yapılandırılmış alanlar zaten mergeliyor,
    // description yalnızca kullanıcıya "ilk bakışta ne var" özetini verir).
    const description = successfulEntries[0].description!;
    const confidence = Math.max(...successfulEntries.map((e) => e.confidence!));

    return {
      success: true,
      result: {
        description,
        confidence,
        structuredExtraction: mergedExtraction,
        fileResults: perFile.map((e) => ({ fileName: e.fileName, status: e.status, errorMessage: e.errorMessage })),
      },
    };
  }

  /**
   * Kullanıcının onayladığı (düzenlenmiş) `ProductCreateRequest`'i
   * `ProductCreateService` (DEĞİŞTİRİLMEDEN) ile kaydeder, SONRA
   * oluşan ürün kimliğiyle: (a) görselleri `photoStorageService` ile
   * diske yazıp `productPhotoIds`'i AYRI bir `update()` çağrısıyla
   * doldurur (mapper/service'e HİÇ dokunmadan), (b) PDF/DOCX/TXT
   * belgelerini MEVCUT `documentService.processDocument()` ile
   * (DEĞİŞTİRİLMEDEN, yalnızca tipi genişletilmiş) RAG'e indeksler.
   */
  public async saveSessionWithDocuments(
    request: ProductCreateRequest,
    userId: string,
    imageFiles: UploadedImageFile[],
    documentFiles: DocumentFileInput[]
  ): Promise<ProductCaptureSaveOutcome> {
    const createOutcome = await productCreateService.createFromRequest(request, userId);
    if (createOutcome.success === false) {
      return createOutcome;
    }

    const productId = createOutcome.product.id;

    const indexedDocuments: { id: string; fileName: string; documentCategory?: string }[] = [];
    const skippedDocuments: { fileName: string; reason: string }[] = [];

    // (a) Fotoğraflar — Photo tablosu KULLANILMADAN, doğrudan dosya URL'i (bkz. models.ts productPhotoIds açıklaması)
    const photoUrls: string[] = [];
    for (const file of imageFiles) {
      try {
        const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
        const saved = photoStorageService.saveNewPhoto(dataUrl);
        photoUrls.push(saved.relativeUrl);
      } catch (error) {
        logger.error("SYSTEM", "Capture session: fotoğraf kaydedilemedi.", error);
      }

      // Sprint 9.6 — KÖK NEDEN DÜZELTMESİ (teşhis turunda kanıtlandı):
      // ÖNCEDEN fotoğraflar yalnızca diske kaydediliyordu, documentService.
      // processDocument()'a HİÇ ULAŞMIYORDU — bu yüzden "Garanti Edilen
      // İçerik"/"Gübreleme Önerileri" gibi fotoğrafların İÇERİĞİ RAG'e HİÇ
      // girmiyordu. Artık ARTIK yeni Document Processing Pipeline
      // (OCR desteğiyle) fotoğrafın METNİNİ de çıkarıp RAG'e indeksliyor —
      // MEVCUT "diske kaydet" davranışı (yukarıdaki blok) HİÇ DEĞİŞMEDİ,
      // bu YALNIZCA EK bir adım.
      const ocrText = await extractTextFromDocumentFile(file.buffer, file.originalname);
      if (ocrText) {
        const uploaded = await documentService.processDocument(
          userId, file.originalname, file.mimetype, file.buffer.length, ocrText, "product", productId, undefined, "Fotoğraf (OCR)"
        );
        if (uploaded) {
          indexedDocuments.push({ id: uploaded.id, fileName: uploaded.fileName, documentCategory: "Fotoğraf (OCR)" });
        }
      } else {
        skippedDocuments.push({ fileName: file.originalname, reason: "OCR ile metin bulunamadı (görsel içerik veya boş sonuç)." });
      }
    }
    if (photoUrls.length > 0) {
      if (createOutcome.type === "Fertilizer") {
        await fertilizerRepository.update(productId, { productPhotoIds: photoUrls });
      } else {
        await chemicalRepository.update(productId, { productPhotoIds: photoUrls });
      }
    }

    // (b) Belgeler — mevcut documentService.processDocument (DEĞİŞMEDİ, yalnızca tipi genişletildi)

    // (c) Sprint 8 — 5. tur düzeltmesi: bu mantık artık PAYLAŞILAN,
    // dışa aktarılan `indexProductSummary()` fonksiyonunda (bkz. dosya
    // sonu) — hem BU akış (Capture Session) hem `/api/products/from-analysis`
    // (Sprint 7F, "Ürün Analizi" tek fotoğraf ekranı) AYNI fonksiyonu
    // çağırıyor. 5. turda kanıtlandı: `/api/products/from-analysis`
    // `ProductCaptureSessionService`'e HİÇ dokunmuyordu, bu yüzden ilk
    // düzeltme (4. tur) yalnızca Capture Session akışına uygulanmıştı.
    const summaryDoc = await indexProductSummary(request, productId, userId);
    if (summaryDoc) {
      indexedDocuments.push({ id: summaryDoc.id, fileName: summaryDoc.fileName, documentCategory: "Ürün Özeti" });
    }

    for (const doc of documentFiles) {
      const textContent = await extractTextFromDocumentFile(doc.buffer, doc.originalname);
      if (!textContent) {
        skippedDocuments.push({ fileName: doc.originalname, reason: "Desteklenmeyen format veya okunabilir metin içeriği yok." });
        continue;
      }
      const uploaded = await documentService.processDocument(
        userId,
        doc.originalname,
        doc.mimetype,
        doc.buffer.length,
        textContent,
        "product",
        productId,
        undefined,
        doc.documentCategory
      );
      if (uploaded) {
        indexedDocuments.push({ id: uploaded.id, fileName: uploaded.fileName, documentCategory: doc.documentCategory });
      } else {
        skippedDocuments.push({ fileName: doc.originalname, reason: "Belge işlenirken/indekslenirken bir hata oluştu." });
      }
    }

    return {
      success: true,
      result: { createOutcome, photoCount: photoUrls.length, indexedDocuments, skippedDocuments },
    };
  }
}

export const productCaptureSessionService = new ProductCaptureSessionService();

/**
 * Kullanıcının onayladığı `ProductCreateRequest` alanlarından, RAG'e
 * indekslenecek basit bir özet metni üretir. Saf fonksiyon — Gemini
 * çağrısı YOK, yalnızca zaten var olan, kullanıcı-onaylı veriyi
 * insan-okur bir metne çevirir (bkz. saveSessionWithDocuments, 4. tur
 * düzeltmesi).
 */
export function buildProductSummaryText(request: ProductCreateRequest): string {
  const lines: string[] = [
    `Ürün Adı: ${request.name}`,
    `Kategori: ${request.type === "Fertilizer" ? "Gübre" : "Zirai İlaç"}`,
  ];
  if (request.brand) lines.push(`Marka: ${request.brand}`);
  if (request.unit) lines.push(`Birim: ${request.unit}`);
  if (request.type === "Fertilizer") {
    if (request.npkRatio) lines.push(`NPK Oranı: ${request.npkRatio}`);
    if (request.organicContentPercent !== undefined) lines.push(`Organik İçerik: %${request.organicContentPercent}`);
    if (request.microElements) lines.push(`Mikro Elementler: ${request.microElements}`);
  } else {
    if (request.activeIngredient) lines.push(`Etken Madde: ${request.activeIngredient}`);
    if (request.concentration) lines.push(`Konsantrasyon: ${request.concentration}`);
    if (request.targetPests && request.targetPests.length > 0) lines.push(`Hedef Zararlılar: ${request.targetPests.join(", ")}`);
    if (request.preHarvestIntervalDays !== undefined) lines.push(`Hasat Öncesi Bekleme Süresi: ${request.preHarvestIntervalDays} gün`);
  }
  return lines.join("\n");
}

/**
 * Sprint 8 — 5. tur düzeltmesi. Kanıtlanan kök neden: bu indeksleme
 * mantığı yalnızca `saveSessionWithDocuments()` (Capture Session akışı)
 * içindeydi — `/api/products/from-analysis` (Sprint 7F'nin ORİJİNAL tek
 * fotoğraf "Ürün Analizi" akışı, `productCreateService.createFromRequest()`'i
 * DOĞRUDAN çağırıyor, `ProductCaptureSessionService`'e HİÇ dokunmuyor)
 * bu fonksiyonu hiç çağırmıyordu. Gerçek HTTP testiyle kanıtlandı:
 * from-analysis ile oluşan üründe `hasLinkedDocuments:false` idi.
 *
 * Bu fonksiyon PAYLAŞILAN, dışa aktarılan bir yardımcıdır — kod tekrarı
 * olmadan HER İKİ route'un da (server.ts) aynı, DEĞİŞTİRİLMEMİŞ
 * `documentService.processDocument()` çağrısını kullanmasını sağlar.
 * Yeni mimari/pipeline DEĞİL — mevcut mantığın ikinci bir çağırana da
 * açılmasıdır.
 */
export async function indexProductSummary(
  request: ProductCreateRequest,
  productId: string,
  userId: string
): Promise<{ id: string; fileName: string } | null> {
  const summaryText = buildProductSummaryText(request);
  try {
    const summaryDoc = await documentService.processDocument(
      userId,
      `${request.name} — Ürün Özeti`,
      "text/plain",
      Buffer.byteLength(summaryText, "utf8"),
      summaryText,
      "product",
      productId,
      undefined,
      "Ürün Özeti"
    );
    return summaryDoc ? { id: summaryDoc.id, fileName: summaryDoc.fileName } : null;
  } catch (error) {
    logger.error("AI", "Ürün özeti RAG'e indekslenemedi.", error);
    return null;
  }
}
