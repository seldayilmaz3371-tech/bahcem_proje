/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { mapAnalysisToFormValues } from "./mapAnalysisToFormValues";
import { ProductAnalysisResult } from "../types";

function baseResult(overrides: Partial<ProductAnalysisResult> = {}): ProductAnalysisResult {
  return {
    description: "Test açıklaması",
    confidence: 0.8,
    detectedObjects: [],
    warnings: [],
    rawResponse: "{}",
    ...overrides,
  };
}

describe("mapAnalysisToFormValues", () => {
  it("[Kullanıcı AI önerisini değiştirebilir — ön-doldurma doğru] structuredExtraction varsa formu doğru ön-doldurur", () => {
    const result = baseResult({
      structuredExtraction: { productName: "Süper Gübre", brand: "TestMarka", categorySuggestion: "Fertilizer", npkRatio: "20-20-20" },
    });

    const formValues = mapAnalysisToFormValues(result);

    expect(formValues.type).toBe("Fertilizer");
    expect(formValues.name).toBe("Süper Gübre");
    expect(formValues.brand).toBe("TestMarka");
    expect(formValues.npkRatio).toBe("20-20-20");
    expect(formValues.sourceAnalysisConfidence).toBe(0.8);
  });

  it("structuredExtraction yoksa (undefined) güvenli boş varsayılanlarla döner, hata fırlatmaz", () => {
    const formValues = mapAnalysisToFormValues(baseResult({ structuredExtraction: undefined }));

    expect(formValues.type).toBe("Fertilizer"); // güvenli varsayılan
    expect(formValues.name).toBe("");
    expect(formValues.brand).toBeUndefined();
  });

  it("result null ise (henüz analiz yok) çökmez, boş form döner", () => {
    const formValues = mapAnalysisToFormValues(null);
    expect(formValues.name).toBe("");
    expect(formValues.type).toBe("Fertilizer");
  });

  it("[Veri kalitesi] packageSize alanı unit alanına OTOMATİK YAZILMAZ (kavramsal olarak farklı alanlar)", () => {
    const result = baseResult({ structuredExtraction: { packageSize: "25 Kg" } });
    const formValues = mapAnalysisToFormValues(result);
    expect(formValues.unit).toBe(""); // kullanıcı doldurmalı, "25 Kg" değil
  });

  it("categorySuggestion Chemical ise formun başlangıç type'ı Chemical olur", () => {
    const result = baseResult({ structuredExtraction: { categorySuggestion: "Chemical", activeIngredient: "Bakır Sülfat" } });
    const formValues = mapAnalysisToFormValues(result);
    expect(formValues.type).toBe("Chemical");
    expect(formValues.activeIngredient).toBe("Bakır Sülfat");
  });
});
