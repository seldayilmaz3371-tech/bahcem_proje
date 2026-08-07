/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PDFParse } from "pdf-parse";
import { logger } from "../../../logger";
import { runOcr } from "./ocr.util";
import { DocumentProcessorStrategy, ExtractedDocumentContent } from "./document-processor.types";

/**
 * Sprint 9.6 — PDF stratejisi. Önce GERÇEK metin katmanını dener
 * (`PDFParse.getText()`, Sprint 8'in DEĞİŞTİRİLMEMİŞ mantığı). Bulunan
 * metin yetersizse (resim-tabanlı/taranmış PDF — bkz. önceki teşhis
 * turunda kanıtlanan "-- 1 of 1 --" sorunu), sayfaları GÖRÜNTÜYE
 * render edip (`PDFParse.getScreenshot()` — pdf-parse'ın KENDİ, ZATEN
 * kurulu özelliği, YENİ bir PDF-render kütüphanesi EKLENMEDİ) OCR'a
 * (paylaşılan `runOcr`, aynı Vision altyapısı) gönderir.
 *
 * Kullanıcı bu farkı hissetmez — dönüş şekli (`ExtractedDocumentContent`)
 * her iki durumda da aynı, yalnızca `extractionMethod` alanı hangi
 * yolun kullanıldığını (teşhis amaçlı) kaydeder.
 */
const MIN_MEANINGFUL_TEXT_LENGTH = 30; // "-- 1 of 1 --" (12 karakter) gibi anlamsız sayfa göstergelerini eleyen, düşük bir eşik

export class PdfTextStrategy implements DocumentProcessorStrategy {
  public readonly supportedExtensions = ["pdf"];

  public async extractContent(buffer: Buffer, originalname: string): Promise<ExtractedDocumentContent> {
    const parser = new PDFParse({ data: buffer });
    let rawText = "";
    try {
      logger.info("RAG", `[PDF Text Extraction] dosya="${originalname}" boyut=${buffer.length} byte`);
      const result = await parser.getText();
      rawText = (result.text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    } finally {
      await parser.destroy();
    }

    if (rawText.length >= MIN_MEANINGFUL_TEXT_LENGTH) {
      logger.info("RAG", `[PDF Text Extraction] dosya="${originalname}" GERÇEK metin katmanı bulundu (${rawText.length} karakter) — OCR gerekmiyor.`);
      return { text: rawText, extractionMethod: "pdf-text-layer" };
    }

    // Metin katmanı yok/yetersiz — resim-tabanlı PDF. Sayfaları render edip OCR'a gönder.
    logger.info("RAG", `[Fallback OCR] dosya="${originalname}" metin katmanı yetersiz (${rawText.length} karakter, "${rawText.slice(0, 30)}") — sayfa görüntüleri OCR'a gönderiliyor.`);
    const ocrText = await this.ocrScannedPdf(buffer, originalname);
    return { text: ocrText, extractionMethod: "pdf-ocr-fallback" };
  }

  private async ocrScannedPdf(buffer: Buffer, originalname: string): Promise<string | null> {
    const parser = new PDFParse({ data: buffer });
    try {
      const screenshots = await parser.getScreenshot({ imageBuffer: true });
      logger.info("RAG", `[OCR Started] dosya="${originalname}" sayfa sayısı=${screenshots.pages.length}`);

      const pageTexts: string[] = [];
      for (const page of screenshots.pages) {
        const pageBuffer = Buffer.from(page.data);
        const pageText = await runOcr(pageBuffer, "image/png");
        if (pageText) pageTexts.push(pageText);
      }

      const combined = pageTexts.join("\n\n").trim() || null;
      logger.info("RAG", `[OCR Finished] dosya="${originalname}" sonuç=${combined ? `${combined.length} karakter` : "boş/başarısız"}`);
      return combined;
    } catch (error) {
      logger.error("RAG", `[Fallback OCR] dosya="${originalname}" sayfa render/OCR işlemi başarısız oldu.`, error);
      return null;
    } finally {
      await parser.destroy();
    }
  }
}

export const pdfTextStrategy = new PdfTextStrategy();
