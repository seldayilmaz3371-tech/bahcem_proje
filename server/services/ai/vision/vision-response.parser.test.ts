/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { parseVisionResponse, VisionResponseParseError } from "./vision-response.parser";

describe("parseVisionResponse", () => {
  it("geçerli JSON'u doğru ayrıştırır", () => {
    const result = parseVisionResponse('{"description": "Yeşil yapraklı bir ağaç", "confidence": 0.8}');
    expect(result.description).toBe("Yeşil yapraklı bir ağaç");
    expect(result.confidence).toBe(0.8);
  });

  it("markdown kod bloğu işaretleyicilerini (```json) temizler", () => {
    const result = parseVisionResponse('```json\n{"description": "Test", "confidence": 0.5}\n```');
    expect(result.description).toBe("Test");
  });

  it("bozuk (geçersiz) JSON için VisionResponseParseError fırlatır", () => {
    expect(() => parseVisionResponse("bu geçerli bir json değil {{{")).toThrow(VisionResponseParseError);
  });

  it("eksik alanlar için şemanın .catch() güvenli varsayılanlarını kullanır (throw etmez)", () => {
    const result = parseVisionResponse("{}");
    expect(result.description).toBe("Analiz tamamlanamadı.");
    expect(result.confidence).toBe(0);
  });

  it("confidence aralık dışıysa (örn. 5) güvenli varsayılana düşer", () => {
    const result = parseVisionResponse('{"description": "Test", "confidence": 5}');
    expect(result.confidence).toBe(0);
  });

  it("JSON bir obje değil de bir diziyse (şema dışı) VisionResponseParseError fırlatır", () => {
    expect(() => parseVisionResponse("[1, 2, 3]")).toThrow(VisionResponseParseError);
  });

  it("boş string için VisionResponseParseError fırlatır", () => {
    expect(() => parseVisionResponse("")).toThrow(VisionResponseParseError);
  });
});
