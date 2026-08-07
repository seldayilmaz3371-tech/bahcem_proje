/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { validateImageFile } from "./image-validation.util";

describe("validateImageFile", () => {
  it("geçerli bir JPEG dosyasını kabul eder", () => {
    const result = validateImageFile({ buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: "image/jpeg", size: 3 });
    expect(result.valid).toBe(true);
  });

  it("dosya hiç yoksa (null) reddeder", () => {
    const result = validateImageFile(null);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain("yüklenmedi");
  });

  it("dosya undefined ise reddeder", () => {
    const result = validateImageFile(undefined);
    expect(result.valid).toBe(false);
  });

  it("boş dosyayı (buffer.length === 0) reddeder", () => {
    const result = validateImageFile({ buffer: Buffer.from([]), mimetype: "image/jpeg", size: 0 });
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain("boş");
  });

  it("okunamayan (buffer olmayan) dosyayı reddeder", () => {
    const result = validateImageFile({ buffer: "bu bir buffer değil" as unknown as Buffer, mimetype: "image/jpeg", size: 10 });
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain("okunamadı");
  });

  it("desteklenmeyen formatı (örn. PDF) reddeder", () => {
    const result = validateImageFile({ buffer: Buffer.from([0x25, 0x50]), mimetype: "application/pdf", size: 2 });
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain("Desteklenmeyen dosya formatı");
  });

  it("mimetype tanımsızsa reddeder", () => {
    const result = validateImageFile({ buffer: Buffer.from([1, 2]), mimetype: "", size: 2 });
    expect(result.valid).toBe(false);
  });

  it("8 MB üzerindeki dosyayı reddeder", () => {
    const oversized = Buffer.alloc(8 * 1024 * 1024 + 1);
    const result = validateImageFile({ buffer: oversized, mimetype: "image/png", size: oversized.length });
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain("büyük");
  });

  it("PNG, WEBP, HEIC, HEIF formatlarının hepsini kabul eder", () => {
    for (const mimetype of ["image/png", "image/webp", "image/heic", "image/heif"]) {
      const result = validateImageFile({ buffer: Buffer.from([1, 2, 3]), mimetype, size: 3 });
      expect(result.valid).toBe(true);
    }
  });
});
