/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { documentProcessorService } from "./document-processing/document-processor.service";

/**
 * Sprint 8 — PDF/DOCX/TXT metin çıkarma.
 *
 * Sprint 9.6 GÜNCELLEMESİ: artık `DocumentProcessorService`'e (Strategy
 * Pattern, bkz. document-processing/) DELEGE EDİYOR — PDF/DOCX/TXT/MD
 * için davranış BİREBİR AYNI (aynı pdf-parse/mammoth çağrıları, yalnızca
 * ayrı stratejilere taşındı), EK OLARAK artık görüntü formatlarını da
 * (OCR ile) destekliyor. İMZA DEĞİŞMEDİ (`Promise<string | null>`) —
 * mevcut çağıranlar (`product-capture-session.service.ts`) HİÇ
 * DEĞİŞMEDEN çalışmaya devam eder.
 */
export async function extractTextFromDocumentFile(buffer: Buffer, originalname: string): Promise<string | null> {
  const result = await documentProcessorService.process(buffer, originalname);
  return result.text;
}

