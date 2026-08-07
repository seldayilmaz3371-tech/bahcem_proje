/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentProcessorStrategy, ExtractedDocumentContent } from "./document-processor.types";

/**
 * Sprint 9.6 — TXT/MD stratejisi. Sprint 8'in mevcut mantığının
 * BİREBİR AYNISI — davranış DEĞİŞMEDİ, yalnızca ayrı bir dosyaya taşındı.
 */
export class PlainTextStrategy implements DocumentProcessorStrategy {
  public readonly supportedExtensions = ["txt", "md"];

  public async extractContent(buffer: Buffer): Promise<ExtractedDocumentContent> {
    const text = buffer.toString("utf8").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text: text || null, extractionMethod: "plain-text" };
  }
}

export const plainTextStrategy = new PlainTextStrategy();
