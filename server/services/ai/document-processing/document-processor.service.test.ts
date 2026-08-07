/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 9.6 — Document Processing Pipeline test süiti.
 * İstenen tüm formatlar (PNG, JPEG, WEBP, PDF-text, PDF-image, DOCX,
 * TXT, MD) tek tek, gerçek stratejiler üzerinden test ediliyor.
 * Yalnızca DIŞ bağımlılıklar (Gemini/OCR, pdf-parse, mammoth) mock'lanıyor
 * — orkestrasyon (Format Detection, Strategy seçimi) GERÇEK kodla çalışır.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./ocr.util", () => ({ runOcr: vi.fn() }));
vi.mock("pdf-parse", () => {
  const PDFParseMock = vi.fn();
  return { PDFParse: PDFParseMock };
});
vi.mock("mammoth", () => ({ default: { extractRawText: vi.fn() } }));

import { DocumentProcessorService } from "./document-processor.service";
import { pdfTextStrategy } from "./pdf.strategy";
import { imageOcrStrategy } from "./image.strategy";
import { docxStrategy } from "./docx.strategy";
import { plainTextStrategy } from "./plain-text.strategy";
import { runOcr } from "./ocr.util";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const mockRunOcr = vi.mocked(runOcr);
const MockPDFParse = vi.mocked(PDFParse);

beforeEach(() => vi.clearAllMocks());

const service = new DocumentProcessorService([pdfTextStrategy, imageOcrStrategy, docxStrategy, plainTextStrategy]);

describe("DocumentProcessorService — 8 format testi", () => {
  it("[PNG] görüntü OCR ile işleniyor", async () => {
    mockRunOcr.mockResolvedValue("PNG'den OCR ile çıkarılan metin.");
    const result = await service.process(Buffer.from("png-data"), "etiket.png");
    expect(result.text).toBe("PNG'den OCR ile çıkarılan metin.");
    expect(result.extractionMethod).toBe("image-ocr");
    expect(mockRunOcr).toHaveBeenCalledWith(expect.any(Buffer), "image/png");
  });

  it("[JPEG] görüntü OCR ile işleniyor", async () => {
    mockRunOcr.mockResolvedValue("JPEG'den OCR ile çıkarılan metin.");
    const result = await service.process(Buffer.from("jpeg-data"), "fotograf.jpeg");
    expect(result.text).toBe("JPEG'den OCR ile çıkarılan metin.");
    expect(result.extractionMethod).toBe("image-ocr");
    expect(mockRunOcr).toHaveBeenCalledWith(expect.any(Buffer), "image/jpeg");
  });

  it("[WEBP] görüntü OCR ile işleniyor", async () => {
    mockRunOcr.mockResolvedValue("WEBP'den OCR ile çıkarılan metin.");
    const result = await service.process(Buffer.from("webp-data"), "gorsel.webp");
    expect(result.text).toBe("WEBP'den OCR ile çıkarılan metin.");
    expect(mockRunOcr).toHaveBeenCalledWith(expect.any(Buffer), "image/webp");
  });

  it("[PDF - gerçek metin katmanı var] OCR'a HİÇ gidilmiyor, doğrudan metin katmanı kullanılıyor", async () => {
    const getTextMock = vi.fn().mockResolvedValue({ text: "Bu PDF'in gerçek, yeterince uzun bir metin katmanı var — 30 karakterden fazla." });
    MockPDFParse.mockImplementation(class { getText = getTextMock; getScreenshot = vi.fn(); destroy = vi.fn(); } as any);
    const result = await service.process(Buffer.from("pdf-data"), "metinli.pdf");
    expect(result.extractionMethod).toBe("pdf-text-layer");
    expect(result.text).toContain("gerçek, yeterince uzun");
    expect(mockRunOcr).not.toHaveBeenCalled();
  });

  it("[PDF - resim tabanlı, metin katmanı yok] OCR fallback devreye giriyor (getScreenshot + runOcr)", async () => {
    const getTextMock = vi.fn().mockResolvedValue({ text: "-- 1 of 1 --" }); // teşhis turunda kanıtlanan GERÇEK senaryo
    const getScreenshotMock = vi.fn().mockResolvedValue({ pages: [{ data: new Uint8Array([1, 2, 3]), pageNumber: 1 }] });
    MockPDFParse.mockImplementation(class { getText = getTextMock; getScreenshot = getScreenshotMock; destroy = vi.fn(); } as any);
    mockRunOcr.mockResolvedValue("Resim tabanlı PDF'den OCR ile çıkarılan gerçek içerik.");

    const result = await service.process(Buffer.from("scanned-pdf-data"), "taranmis.pdf");
    expect(result.extractionMethod).toBe("pdf-ocr-fallback");
    expect(result.text).toBe("Resim tabanlı PDF'den OCR ile çıkarılan gerçek içerik.");
    expect(mockRunOcr).toHaveBeenCalledWith(expect.any(Buffer), "image/png");
  });

  it("[DOCX] mammoth ile işleniyor", async () => {
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: "DOCX'ten çıkarılan metin.", messages: [] } as any);
    const result = await service.process(Buffer.from("docx-data"), "belge.docx");
    expect(result.text).toBe("DOCX'ten çıkarılan metin.");
    expect(result.extractionMethod).toBe("docx");
  });

  it("[TXT] doğrudan okunuyor", async () => {
    const result = await service.process(Buffer.from("Düz metin içeriği.", "utf8"), "not.txt");
    expect(result.text).toBe("Düz metin içeriği.");
    expect(result.extractionMethod).toBe("plain-text");
  });

  it("[MD] doğrudan okunuyor", async () => {
    const result = await service.process(Buffer.from("# Başlık\n\nMarkdown içerik.", "utf8"), "notlar.md");
    expect(result.text).toBe("# Başlık\n\nMarkdown içerik.");
    expect(result.extractionMethod).toBe("plain-text");
  });

  it("[Desteklenmeyen format] unsupported döner, hata fırlatmaz", async () => {
    const result = await service.process(Buffer.from("data"), "arsiv.zip");
    expect(result.text).toBeNull();
    expect(result.extractionMethod).toBe("unsupported");
  });

  it("[OCR başarısız] görüntü için OCR null dönerse, text null olur, sistem çökmez", async () => {
    mockRunOcr.mockResolvedValue(null);
    const result = await service.process(Buffer.from("data"), "bozuk.png");
    expect(result.text).toBeNull();
    expect(result.extractionMethod).toBe("image-ocr");
  });
});
