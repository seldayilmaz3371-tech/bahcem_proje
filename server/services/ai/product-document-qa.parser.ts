/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { productDocumentAnswerSchema, ProductDocumentAnswer } from "../../prompts/product-document-qa.prompt";

/**
 * Sprint 7H — Answer Parser. Aynı desen: markdown temizleme, JSON.parse,
 * Zod doğrulama (bkz. vision-response.parser.ts/label-extraction.parser.ts
 * — bu ikisine dokunulmadı, yalnızca AYNI, kanıtlanmış desen yeni bir
 * bağımsız dosyada tekrarlandı, çünkü her birinin şeması farklı).
 */
export class ProductDocumentAnswerParseError extends Error {}

export function parseProductDocumentAnswer(rawText: string): ProductDocumentAnswer {
  const cleanedText = rawText.replace(/^```json\s*|```\s*$/g, "").trim();

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(cleanedText);
  } catch {
    throw new ProductDocumentAnswerParseError("Yanıt geçerli bir JSON değil.");
  }

  const result = productDocumentAnswerSchema.safeParse(rawParsed);
  if (!result.success) {
    throw new ProductDocumentAnswerParseError("Yanıt beklenen şemayla eşleşmiyor.");
  }
  return result.data;
}
