/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { structuredLabelExtractionSchema, StructuredLabelExtraction } from "../../prompts/label-extraction.prompt";

/**
 * Sprint 7G — Label Extraction Response Parser.
 *
 * Sprint 7D'nin `vision-response.parser.ts`'iyle AYNI deseni (markdown
 * temizleme, JSON.parse, Zod doğrulama) kullanır ama BAĞIMSIZ bir
 * implementasyondur — `vision-response.parser.ts`'e dokunulmadı, farklı
 * bir şema (`structuredLabelExtractionSchema`) doğruluyor.
 */
export class LabelExtractionParseError extends Error {}

export function parseLabelExtractionResponse(rawText: string): StructuredLabelExtraction {
  const cleanedText = rawText.replace(/^```json\s*|```\s*$/g, "").trim();

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(cleanedText);
  } catch {
    throw new LabelExtractionParseError("Etiket ayrıştırma yanıtı geçerli bir JSON değil.");
  }

  const result = structuredLabelExtractionSchema.safeParse(rawParsed);
  if (!result.success) {
    throw new LabelExtractionParseError("Etiket ayrıştırma yanıtı beklenen şemayla eşleşmiyor.");
  }
  return result.data;
}
