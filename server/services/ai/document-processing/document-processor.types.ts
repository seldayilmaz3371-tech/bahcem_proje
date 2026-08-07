/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 9.6 — Document Processing Pipeline (Strategy Pattern).
 *
 * Tek giriş noktası: `DocumentProcessorService.process()` (bkz.
 * document-processor.service.ts). Her format-özel strateji bu arayüzü
 * uygular; hangi stratejinin çağrılacağı Format Detection aşamasında
 * (dosya uzantısına göre) belirlenir — PDF/PNG/DOCX kod olarak
 * BİRBİRİNDEN KOPUK DEĞİL, hepsi AYNI orkestratör üzerinden, AYNI
 * dönüş şeklini (`ExtractedDocumentContent`) üretir.
 */
export interface ExtractedDocumentContent {
  /** Çıkarılan düz metin. Hiçbir yöntemle metin elde edilemezse `null` (uydurma yok). */
  text: string | null;
  /**
   * Metnin GERÇEKTEN nasıl elde edildiği — teşhis/log amaçlı, RAG
   * kalitesini etkilemez ama "neden bu metin geldi" sorusunu her zaman
   * cevaplanabilir kılar (bkz. önceki turların OCR/PDF teşhis sorunları).
   */
  extractionMethod: "pdf-text-layer" | "pdf-ocr-fallback" | "image-ocr" | "docx" | "plain-text" | "unsupported";
  /**
   * Sprint 9.6 — SINIRLI, mevcut VectorChunk şemasına (heading/topics/
   * keywords/cropType) UYAN metadata. Yeni şema alanı İCAT EDİLMEDİ —
   * yalnızca ÖNCEDEN VAR OLAN ama hiç doldurulmayan alanlar (Sprint 2C'den
   * beri boş bırakılan topics/keywords) artık gerçekten dolduruluyor.
   */
  metadata?: {
    heading?: string;
    topics?: string[];
    keywords?: string[];
  };
}

/**
 * Her format-özel strateji bu arayüzü uygular (Open/Closed Principle —
 * yeni bir format eklemek için MEVCUT stratejilere DOKUNULMADAN, yeni
 * bir strateji sınıfı eklenip `document-processor.service.ts`'teki
 * kayıt listesine eklenmesi yeterlidir).
 */
export interface DocumentProcessorStrategy {
  /** Bu stratejinin işleyebildiği dosya uzantıları (küçük harf, nokta olmadan). */
  readonly supportedExtensions: string[];
  extractContent(buffer: Buffer, originalname: string): Promise<ExtractedDocumentContent>;
}
