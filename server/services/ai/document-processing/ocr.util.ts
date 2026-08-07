/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../../logger";
import { geminiVisionAdapter } from "../vision/gemini-vision.adapter";
import { buildOcrPrompt } from "../../../prompts/ocr.prompt";

/**
 * Sprint 9.6 — PAYLAŞILAN OCR fonksiyonu. Hem `image.strategy.ts`
 * (görüntü dosyaları) hem `pdf.strategy.ts` (resim-tabanlı PDF fallback'i)
 * tarafından kullanılır — kod tekrarı yok, tek kaynak.
 *
 * `geminiVisionAdapter`'ı (Sprint 7D, DEĞİŞTİRİLMEDİ) AYNEN kullanır —
 * YENİ bir Gemini/OCR kütüphanesi/entegrasyonu YOK, yalnızca farklı
 * bir prompt ile MEVCUT Vision altyapısı çağrılıyor (Architecture
 * Freeze §8'in "yalnızca Vision modeli" kararıyla tutarlı).
 *
 * Asla throw etmez — başarısızlıkta `null` döner, çağıran bunu
 * "OCR metni bulunamadı" olarak ele alır (hard-crash yok).
 */
export async function runOcr(imageBuffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    const base64Data = imageBuffer.toString("base64");
    const rawText = await geminiVisionAdapter.analyzeImage(buildOcrPrompt(), { base64Data, mimeType });
    const trimmed = rawText?.trim();
    return trimmed || null;
  } catch (error) {
    logger.error("RAG", "[OCR] Görüntüden metin çıkarma başarısız oldu.", error);
    return null;
  }
}
