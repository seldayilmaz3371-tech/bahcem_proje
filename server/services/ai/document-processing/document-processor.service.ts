/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../../logger";
import { DocumentProcessorStrategy, ExtractedDocumentContent } from "./document-processor.types";
import { pdfTextStrategy } from "./pdf.strategy";
import { imageOcrStrategy } from "./image.strategy";
import { docxStrategy } from "./docx.strategy";
import { plainTextStrategy } from "./plain-text.strategy";

/**
 * Sprint 9.6 — Document Processing Pipeline. TEK giriş noktası:
 * `process(buffer, originalname)`. Format Detection (dosya uzantısı),
 * hangi stratejinin çağrılacağını belirler (Strategy Pattern) — PDF/
 * PNG/DOCX/TXT birbirinden KOPUK, tekrarlı kod değil; hepsi AYNI
 * orkestratörden, AYNI dönüş şeklini (`ExtractedDocumentContent`) üretir.
 *
 * YENİ BİR FORMAT EKLEMEK (Open/Closed Principle): mevcut stratejilerin
 * HİÇBİRİNE dokunmadan, yeni bir `DocumentProcessorStrategy`
 * implementasyonu yazıp `strategies` dizisine eklemek yeterlidir (bkz.
 * "İleride kolayca eklenecek: DOCX✓, TXT✓, MD✓, XLSX, CSV").
 */
export class DocumentProcessorService {
  private readonly strategies: DocumentProcessorStrategy[];

  constructor(strategies: DocumentProcessorStrategy[]) {
    this.strategies = strategies;
  }

  public async process(buffer: Buffer, originalname: string): Promise<ExtractedDocumentContent> {
    const extension = originalname.split(".").pop()?.toLowerCase() ?? "";
    logger.info("RAG", `[Document Pipeline] dosya="${originalname}" başladı.`);
    logger.info("RAG", `[Format Detection] dosya="${originalname}" uzantı=".${extension}"`);

    const strategy = this.strategies.find((s) => s.supportedExtensions.includes(extension));
    if (!strategy) {
      logger.info("RAG", `[Format Detection] dosya="${originalname}" desteklenmeyen format (.${extension}) — atlanıyor.`);
      return { text: null, extractionMethod: "unsupported" };
    }

    const result = await strategy.extractContent(buffer, originalname);
    logger.info(
      "RAG",
      `[Document Pipeline] dosya="${originalname}" tamamlandı. yöntem=${result.extractionMethod} metin=${result.text ? `${result.text.length} karakter` : "yok"}`
    );
    return result;
  }
}

/**
 * Varsayılan, önceden bağlanmış örnek — mevcut, DEĞİŞTİRİLMEMİŞ
 * stratejilerle (pdfTextStrategy, imageOcrStrategy, docxStrategy,
 * plainTextStrategy) yapılandırılmış.
 */
export const documentProcessorService = new DocumentProcessorService([
  pdfTextStrategy,
  imageOcrStrategy,
  docxStrategy,
  plainTextStrategy,
]);
