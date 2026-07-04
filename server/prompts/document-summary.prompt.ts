/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Maximum characters of a document's content included in the summary prompt. */
const MAX_SUMMARY_SOURCE_LENGTH = 3000;

/**
 * Builds the prompt used to generate a short automatic summary for a
 * newly uploaded RAG document. Extracted into its own module per this
 * project's mandated prompt-management architecture.
 * @param textContent Full extracted text of the uploaded document
 */
export function buildDocumentSummaryPrompt(textContent: string): string {
  return `Aşağıdaki tarımsal dokümanı 2 cümle ile özetle. Çiftçinin ne konuda bilgi edinebileceğini belirt:\n\n${textContent.substring(0, MAX_SUMMARY_SOURCE_LENGTH)}`;
}
