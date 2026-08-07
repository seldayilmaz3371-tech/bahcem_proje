/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../../logger";
import { runOcr } from "./ocr.util";
import { DocumentProcessorStrategy, ExtractedDocumentContent } from "./document-processor.types";

/**
 * Sprint 9.6 — Görüntü dosyaları (PNG/JPG/JPEG/WEBP/HEIC/BMP/TIFF) için
 * OCR stratejisi. Bu, önceki teşhis turunda kanıtlanan boşluğu kapatır:
 * fotoğraflar ARTIK yalnızca diske kaydedilip bırakılmıyor — RAG
 * pipeline'ına metin olarak giriyor (bkz. document-processor.service.ts
 * ve product-capture-session.service.ts entegrasyonu).
 *
 * NOT (dürüstçe belirtiliyor): Gemini Vision API'sinin BMP/TIFF
 * formatlarını gerçekten desteklediği bu ortamda doğrulanamadı
 * (GEMINI_API_KEY yok) — mevcut, Sprint 7D'nin `image-validation.util.ts`'i
 * yalnızca jpeg/png/webp/heic/heif'i "resmi olarak desteklenen" sayıyor.
 * BMP/TIFF için istek gönderiliyor ama API'nin bunu kabul edip
 * etmeyeceği gerçek bir API çağrısıyla test edilmedi.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
};

export class ImageOcrStrategy implements DocumentProcessorStrategy {
  public readonly supportedExtensions = Object.keys(EXTENSION_TO_MIME);

  public async extractContent(buffer: Buffer, originalname: string): Promise<ExtractedDocumentContent> {
    const extension = originalname.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = EXTENSION_TO_MIME[extension];
    if (!mimeType) {
      return { text: null, extractionMethod: "unsupported" };
    }

    logger.info("RAG", `[OCR Started] dosya="${originalname}" mimeType=${mimeType} boyut=${buffer.length} byte`);
    const ocrText = await runOcr(buffer, mimeType);
    logger.info("RAG", `[OCR Finished] dosya="${originalname}" sonuç=${ocrText ? `${ocrText.length} karakter` : "boş/başarısız"}`);

    return {
      text: ocrText,
      extractionMethod: "image-ocr",
    };
  }
}

export const imageOcrStrategy = new ImageOcrStrategy();
