/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mammoth from "mammoth";
import { DocumentProcessorStrategy, ExtractedDocumentContent } from "./document-processor.types";

/**
 * Sprint 9.6 — DOCX stratejisi. Sprint 8'in `document-text-extraction.util.ts`'teki
 * mammoth mantığının BİREBİR AYNISI — davranış DEĞİŞMEDİ, yalnızca
 * Strategy Pattern'e uyacak şekilde ayrı bir dosyaya taşındı.
 */
export class DocxStrategy implements DocumentProcessorStrategy {
  public readonly supportedExtensions = ["docx"];

  public async extractContent(buffer: Buffer): Promise<ExtractedDocumentContent> {
    const result = await mammoth.extractRawText({ buffer });
    const text = (result.value || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text: text || null, extractionMethod: "docx" };
  }
}

export const docxStrategy = new DocxStrategy();
