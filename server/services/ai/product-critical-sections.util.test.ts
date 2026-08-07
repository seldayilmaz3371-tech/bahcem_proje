/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { findCriticalSectionChunks, CRITICAL_SECTION_KEYWORDS } from "./product-critical-sections.util";
import { VectorChunk } from "../../models";

function fakeChunk(overrides: Partial<VectorChunk>): VectorChunk {
  return { id: "c1", documentId: "doc-1", chunkIndex: 0, content: "", embeddings: [], ...overrides };
}

describe("findCriticalSectionChunks (Sprint 9.24)", () => {
  it("[GERÇEK KULLANICI SENARYOSU] 'KULLANMA ŞEKLİ ve ZAMANI' başlıklı chunk yakalanır", () => {
    const chunks = [
      fakeChunk({ id: "c9", heading: "KULLANMA ŞEKLİ ve ZAMANI", content: "Meyve tutumundan itibaren uygulanır." }),
      fakeChunk({ id: "irrelevant", heading: "Genel Bilgi", content: "Alakasız bir metin." }),
    ];
    const result = findCriticalSectionChunks(chunks);
    expect(result.map((c) => c.id)).toEqual(["c9"]);
  });

  it("[GERÇEK KULLANICI SENARYOSU] 'Bağ, Patates vb. uygulama zamanı' içerikli chunk (heading yok, yalnızca content) yakalanır", () => {
    const chunks = [
      fakeChunk({ id: "c11", heading: undefined, content: "Bağ, Patates vb. uygulama zamanı: çiçeklenme öncesi." }),
    ];
    const result = findCriticalSectionChunks(chunks);
    expect(result.map((c) => c.id)).toEqual(["c11"]);
  });

  it("Garanti Edilen İçerik ve NPK chunk'ları yakalanır (Sprint 9.17'de doğrulanan gerçek içerik)", () => {
    const chunks = [
      fakeChunk({ id: "c-garanti", heading: "GARANTİ EDİLEN İÇERİK", content: "Toplam Azot (N): 10" }),
      fakeChunk({ id: "c-npk", heading: undefined, content: "NPK Oranı: 10-5-40" }),
    ];
    const result = findCriticalSectionChunks(chunks);
    expect(result.map((c) => c.id).sort()).toEqual(["c-garanti", "c-npk"]);
  });

  it("Alakasız chunk'lar (kritik anahtar kelime içermeyen) yakalanmaz", () => {
    const chunks = [fakeChunk({ id: "c1", heading: "Genel Açıklama", content: "Bu ürün hakkında genel bir metin." })];
    expect(findCriticalSectionChunks(chunks)).toEqual([]);
  });

  it("boş liste -> boş liste", () => {
    expect(findCriticalSectionChunks([])).toEqual([]);
  });

  it("case-insensitive eşleşme (Türkçe büyük/küçük harf)", () => {
    const chunks = [fakeChunk({ id: "c1", heading: "DEPOLAMA KOŞULLARI", content: "" })];
    expect(findCriticalSectionChunks(chunks).map((c) => c.id)).toEqual(["c1"]);
  });

  it("CRITICAL_SECTION_KEYWORDS listesi boş değil ve tekrar içermiyor", () => {
    expect(CRITICAL_SECTION_KEYWORDS.length).toBeGreaterThan(0);
    expect(new Set(CRITICAL_SECTION_KEYWORDS).size).toBe(CRITICAL_SECTION_KEYWORDS.length);
  });
});
