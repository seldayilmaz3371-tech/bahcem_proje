/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { mergeStructuredExtractions } from "./product-capture-session.merge";

describe("mergeStructuredExtractions", () => {
  it("[Ürün adı yalnızca ilk fotoğrafta] doğru şekilde sonuca taşınır", () => {
    const merged = mergeStructuredExtractions([
      { productName: "10.5.40+ME", brand: "GÜBRETAŞ" },
      { npkRatio: "10-5-40" },
      { packageSize: "25 Kg" },
    ]);
    expect(merged.productName).toBe("10.5.40+ME");
    expect(merged.brand).toBe("GÜBRETAŞ");
    expect(merged.npkRatio).toBe("10-5-40");
    expect(merged.packageSize).toBe("25 Kg");
  });

  it("[Ürün adı yalnızca son fotoğrafta] sıra bağımsız, yine doğru taşınır", () => {
    const merged = mergeStructuredExtractions([
      { npkRatio: "10-5-40" },
      { packageSize: "25 Kg" },
      { productName: "10.5.40+ME", brand: "GÜBRETAŞ" },
    ]);
    expect(merged.productName).toBe("10.5.40+ME");
    expect(merged.brand).toBe("GÜBRETAŞ");
  });

  it("[Hiç ürün adı bulunmaması] hata fırlatmaz, alan undefined kalır, diğer alanlar korunur", () => {
    const merged = mergeStructuredExtractions([{ npkRatio: "10-5-40" }, { packageSize: "25 Kg" }]);
    expect(merged.productName).toBeUndefined();
    expect(merged.npkRatio).toBe("10-5-40");
    expect(merged.packageSize).toBe("25 Kg");
  });

  it("[NPK farklı fotoğrafta] diğer fotoğraflarda NPK yokken doğru taşınır", () => {
    const merged = mergeStructuredExtractions([
      { brand: "GÜBRETAŞ" },
      { productName: "10.5.40+ME" },
      { npkRatio: "10-5-40" },
      { manufacturer: "Gübretaş A.Ş." },
    ]);
    expect(merged.npkRatio).toBe("10-5-40");
  });

  it("boş dizi -> boş obje döner, hata fırlatmaz", () => {
    const merged = mergeStructuredExtractions([]);
    expect(Object.keys(merged).length).toBe(0);
  });

  it("aynı alan birden fazla fotoğrafta farklı değerlerle varsa İLK bulunan kazanır (tutarlı, deterministik kural)", () => {
    const merged = mergeStructuredExtractions([{ brand: "İlkMarka" }, { brand: "İkinciMarka" }]);
    expect(merged.brand).toBe("İlkMarka");
  });

  it("importantWarnings TÜM fotoğraflardan birleştirilir (union), 'ilk kazanır' kuralı BURADA uygulanmaz", () => {
    const merged = mergeStructuredExtractions([
      { importantWarnings: ["Gözle temas ettirmeyiniz"] },
      { importantWarnings: ["Çocuklardan uzak tutunuz", "Gözle temas ettirmeyiniz"] }, // tekrar
    ]);
    expect(merged.importantWarnings).toHaveLength(2); // dedup edildi
    expect(merged.importantWarnings).toContain("Gözle temas ettirmeyiniz");
    expect(merged.importantWarnings).toContain("Çocuklardan uzak tutunuz");
  });

  it("hiçbir fotoğrafta importantWarnings yoksa alan hiç eklenmez (undefined kalır, boş dizi değil)", () => {
    const merged = mergeStructuredExtractions([{ brand: "Test" }]);
    expect(merged.importantWarnings).toBeUndefined();
  });
});
