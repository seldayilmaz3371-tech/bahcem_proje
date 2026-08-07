/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { evaluateDocumentCoverage } from "./evidence-evaluation.util";
import { VectorChunk } from "../../models";

function fakeChunk(documentId: string, id: string): VectorChunk {
  return { id, documentId, chunkIndex: 0, content: "test", embeddings: [] };
}

describe("evaluateDocumentCoverage (Sprint 9.11 — Evidence Architecture v2, belge bazlı)", () => {
  it("[Tamamen var] tek belge, en yüksek skor STRONG eşiğini (0.7) geçerse overall='full'", () => {
    const result = evaluateDocumentCoverage([{ chunk: fakeChunk("doc-1", "c1"), score: 0.85 }]);
    expect(result.overall).toBe("full");
    expect(result.perDocument).toHaveLength(1);
    expect(result.perDocument[0].coverage).toBe("full");
  });

  it("[Kısmen var] tek belge, yalnızca MODERATE eşiğini (0.55) geçerse overall='partial'", () => {
    const result = evaluateDocumentCoverage([{ chunk: fakeChunk("doc-1", "c1"), score: 0.6 }]);
    expect(result.overall).toBe("partial");
  });

  it("[Hiç yok] boş liste -> overall='none', perDocument boş", () => {
    const result = evaluateDocumentCoverage([]);
    expect(result.overall).toBe("none");
    expect(result.perDocument).toEqual([]);
  });

  it("[KESİN KANIT — SPRINT 9.11 KÖK NEDEN SENARYOSU] Ürün Özeti YÜKSEK (0.85), Garanti+Doz ORTA (0.6/0.58) -> overall ARTIK 'full' DEĞİL, 'partial'", () => {
    const ragMatches = [
      { chunk: fakeChunk("doc-urun-ozeti", "c-ozet"), score: 0.85 }, // full
      { chunk: fakeChunk("doc-garanti", "c-garanti"), score: 0.6 }, // partial
      { chunk: fakeChunk("doc-gubreleme", "c-gubreleme"), score: 0.58 }, // partial
    ];
    const result = evaluateDocumentCoverage(ragMatches);
    // ÖNCEKİ (Sprint 9.10) algoritma: Math.max(0.85,0.6,0.58)=0.85 -> "full" (YANLIŞ)
    // YENİ (Sprint 9.11) algoritma: en zayıf belge "partial" olduğu için overall="partial" (DOĞRU)
    expect(result.overall).toBe("partial");
    expect(result.perDocument).toHaveLength(3);
    expect(result.perDocument.find((d) => d.documentId === "doc-urun-ozeti")?.coverage).toBe("full");
    expect(result.perDocument.find((d) => d.documentId === "doc-garanti")?.coverage).toBe("partial");
    expect(result.perDocument.find((d) => d.documentId === "doc-gubreleme")?.coverage).toBe("partial");
  });

  it("[TEST 1 senaryosu — 4 belge] her belge kendi en iyi chunk'ıyla, ayrı ayrı temsil edilir", () => {
    const ragMatches = [
      { chunk: fakeChunk("doc-garanti", "c1"), score: 0.91 },
      { chunk: fakeChunk("doc-garanti", "c1b"), score: 0.4 }, // aynı belgenin daha düşük skorlu chunk'ı -> belge yine de 0.91 ile temsil edilir
      { chunk: fakeChunk("doc-gubreleme", "c2"), score: 0.82 },
      { chunk: fakeChunk("doc-ozet", "c3"), score: 0.78 },
      { chunk: fakeChunk("doc-diger", "c4"), score: 0.3 },
    ];
    const result = evaluateDocumentCoverage(ragMatches);
    expect(result.perDocument).toHaveLength(4); // 4 AYRI belge, her biri temsil ediliyor
    expect(result.perDocument.find((d) => d.documentId === "doc-garanti")?.topScore).toBe(0.91); // en iyi chunk kullanıldı, düşük olan değil
  });

  it("belge içindeki en düşük skorlu chunk, o belgenin coverage'ını DÜŞÜRMEZ (yalnızca en iyi chunk sayılır)", () => {
    const ragMatches = [
      { chunk: fakeChunk("doc-1", "c1"), score: 0.9 },
      { chunk: fakeChunk("doc-1", "c2"), score: 0.1 }, // aynı belgenin ÇOK düşük skorlu başka bir chunk'ı
    ];
    const result = evaluateDocumentCoverage(ragMatches);
    expect(result.perDocument).toHaveLength(1); // tek belge
    expect(result.perDocument[0].coverage).toBe("full"); // en iyi chunk (0.9) baz alındı
  });
});
