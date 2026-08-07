/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 9.1 — SORUN 1/6. `filterRelevantMatches`, hem
 * `context-builder.service.ts` (Karar Destek) hem
 * `product-document-qa.service.ts` (Belgelere Sor) tarafından
 * PAYLAŞILAN, tek bir fonksiyondur — bu test dosyası, her iki
 * tüketicinin de AYNI, DOĞRU filtreleme davranışına sahip olduğunu
 * garanti eder (kod tekrarı yok, tek kaynak).
 */

import { describe, it, expect } from "vitest";
import { filterRelevantMatches, MIN_RELEVANT_SIMILARITY_SCORE, groupMatchesByDocument, selectDiverseTopMatches } from "./rag-retrieval.service";
import { VectorChunk } from "../../models";

function fakeChunk(overrides: Partial<VectorChunk> = {}): VectorChunk {
  return { id: "c1", documentId: "doc-1", chunkIndex: 0, content: "test", embeddings: [], ...overrides };
}

describe("filterRelevantMatches (Sprint 9.1 — paylaşılan eşik filtresi)", () => {
  it("eşiği geçen bir sonucu tutar", () => {
    const result = filterRelevantMatches([{ chunk: fakeChunk(), score: 0.9 }]);
    expect(result).toHaveLength(1);
  });

  it("eşiğin altındaki bir sonucu eler", () => {
    const result = filterRelevantMatches([{ chunk: fakeChunk(), score: 0.2 }]);
    expect(result).toHaveLength(0);
  });

  it("[Sprint 8, 6. tur hatasının regresyon testi] yüksek-skorlu bir sonuç varken, düşük-skorlu diğer sonuç YİNE DE elenir (yalnızca ilk sonuca bakılmıyor)", () => {
    const result = filterRelevantMatches([
      { chunk: fakeChunk({ id: "c-alakali", documentId: "doc-urun-ozeti" }), score: 0.821 },
      { chunk: fakeChunk({ id: "c-alakasiz", documentId: "doc-mantar-ilaci" }), score: 0.35 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].chunk.documentId).toBe("doc-urun-ozeti");
  });

  it("eşik değeri tam sınırda ise (>=) dahil edilir", () => {
    const result = filterRelevantMatches([{ chunk: fakeChunk(), score: MIN_RELEVANT_SIMILARITY_SCORE }]);
    expect(result).toHaveLength(1);
  });

  it("boş liste -> boş liste döner, hata fırlatmaz", () => {
    expect(filterRelevantMatches([])).toEqual([]);
  });
});

describe("selectDiverseTopMatches (Sprint 9.7 — Per-Document Top-K + Global Backfill)", () => {
  function m(documentId: string, chunkId: string, score: number) {
    return { chunk: fakeChunk({ id: chunkId, documentId }), score };
  }

  it("[TEST 1 — 'Bakır (Cu) oranı nedir?'] tek belge net biçimde en alakalıysa, o belgenin chunk'ları öne çıkar", () => {
    const sorted = [
      m("doc-garanti", "gei-2", 0.85), m("doc-garanti", "gei-3", 0.7),
      m("doc-gubreleme", "gub-0", 0.4), m("doc-gubreleme", "gub-1", 0.35),
    ];
    const result = selectDiverseTopMatches(sorted, 4);
    expect(result.map((r) => r.chunk.id)).toEqual(["gei-2", "gei-3", "gub-0", "gub-1"]);
  });

  it("[TEST 2 — 'Domates için doz nedir?'] simetrik senaryo, Gübreleme belgesi öne çıkar", () => {
    const sorted = [
      m("doc-gubreleme", "gub-0", 0.9), m("doc-gubreleme", "gub-1", 0.85),
      m("doc-garanti", "gei-1", 0.3), m("doc-garanti", "gei-2", 0.25),
    ];
    const result = selectDiverseTopMatches(sorted, 4);
    expect(result[0].chunk.id).toBe("gub-0");
  });

  it("[TEST 3 — KESİN KÖK NEDEN SENARYOSU: 'Bakır oranı + Domates dozu'] Gübreleme'nin 6 yüksek skorlu chunk'ı, Garanti'nin threshold'u geçen tek chunk'ını ARTIK dışarıda bırakmıyor", () => {
    // Sprint 9.7 teşhis turunda kanıtlanan GERÇEK senaryo: Gubreleme'nin
    // 6 chunk'ı da Garanti'nin İLGİLİ chunk'ından (gei-2, 0.6011) yüksek
    // skorlu — SAF Global Top-N bunu TAMAMEN elerdi.
    const sorted = [
      m("doc-gubreleme", "gub-0", 0.997), m("doc-gubreleme", "gub-1", 0.9967),
      m("doc-gubreleme", "gub-2", 0.9963), m("doc-gubreleme", "gub-3", 0.996),
      m("doc-gubreleme", "gub-4", 0.9956), m("doc-gubreleme", "gub-5", 0.9952),
      m("doc-garanti", "gei-2", 0.6011), // "Bakır (Cu)" içeren chunk — threshold'u (0.55) geçiyor
      m("doc-garanti", "gei-3", 0.5358), m("doc-garanti", "gei-4", 0.5152), m("doc-garanti", "gei-1", 0.347),
    ];
    const result = selectDiverseTopMatches(sorted, 4);
    const documentIdsInResult = new Set(result.map((r) => r.chunk.documentId));
    // KESİN KANIT: her iki belge de sonuçta temsil ediliyor — "Bakır" chunk'ı ARTIK dışarıda kalmıyor
    expect(documentIdsInResult.has("doc-garanti")).toBe(true);
    expect(documentIdsInResult.has("doc-gubreleme")).toBe(true);
    expect(result.some((r) => r.chunk.id === "gei-2")).toBe(true);
  });

  it("[TEST 4 — '10.5.40 ME hakkında bütün bilgileri özetle'] 4 belge (Ürün Özeti/Garanti/Gübreleme/Foto OCR), hepsi temsil edilir", () => {
    const sorted = [
      m("doc-ozet", "ozet-1", 0.9),
      m("doc-garanti", "gei-1", 0.85), m("doc-garanti", "gei-2", 0.8),
      m("doc-gubreleme", "gub-1", 0.75), m("doc-gubreleme", "gub-2", 0.7),
      m("doc-foto", "foto-1", 0.6),
    ];
    const result = selectDiverseTopMatches(sorted, 4);
    const documentIdsInResult = new Set(result.map((r) => r.chunk.documentId));
    // 4 belge, limit=4 -> maxPerDocument=1 -> her belgeden en az 1 (kotayı dolduran ilk 4)
    expect(documentIdsInResult.size).toBe(4);
  });

  it("bazı belgelerin yeterli adayı yoksa, boş kalan bütçe israf edilmez (backfill çalışır)", () => {
    const sorted = [
      m("doc-a", "a-1", 0.9), // doc-a'nın TEK adayı
      m("doc-b", "b-1", 0.85), m("doc-b", "b-2", 0.8), m("doc-b", "b-3", 0.75), m("doc-b", "b-4", 0.7),
    ];
    const result = selectDiverseTopMatches(sorted, 4);
    expect(result).toHaveLength(4); // doc-a'nın kotası 1 dolunca, kalan 3 slot doc-b'den (backfill)
    expect(result.map((r) => r.chunk.id).sort()).toEqual(["a-1", "b-1", "b-2", "b-3"]);
  });

  it("tek belge varsa Global Top-N ile birebir aynı davranır", () => {
    const sorted = [m("doc-a", "a-1", 0.9), m("doc-a", "a-2", 0.8), m("doc-a", "a-3", 0.7)];
    const result = selectDiverseTopMatches(sorted, 2);
    expect(result.map((r) => r.chunk.id)).toEqual(["a-1", "a-2"]);
  });

  it("boş liste -> boş liste döner, hata fırlatmaz", () => {
    expect(selectDiverseTopMatches([], 4)).toEqual([]);
  });
});

describe("groupMatchesByDocument (Sprint 9.1 — SORUN 2/3/6, Belgelere Sor + Karar Destek paylaşılan gruplama)", () => {
  it("aynı documentId'ye ait chunk'ları tek gruba toplar", () => {
    const groups = groupMatchesByDocument([
      { chunk: fakeChunk({ id: "c1", documentId: "doc-A", chunkIndex: 1 }), score: 0.7 },
      { chunk: fakeChunk({ id: "c2", documentId: "doc-A", chunkIndex: 0 }), score: 0.8 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("grup içini chunkIndex'e göre sıralar (okuma sırası)", () => {
    const groups = groupMatchesByDocument([
      { chunk: fakeChunk({ id: "c1", documentId: "doc-A", chunkIndex: 2 }), score: 0.7 },
      { chunk: fakeChunk({ id: "c2", documentId: "doc-A", chunkIndex: 0 }), score: 0.7 },
    ]);
    expect(groups[0].map((m) => m.chunk.chunkIndex)).toEqual([0, 2]);
  });

  it("gruplar arasını EN YÜKSEK skora göre sıralar (en alakalı belge önce)", () => {
    const groups = groupMatchesByDocument([
      { chunk: fakeChunk({ id: "c1", documentId: "doc-dusuk" }), score: 0.6 },
      { chunk: fakeChunk({ id: "c2", documentId: "doc-yuksek" }), score: 0.9 },
    ]);
    expect(groups[0][0].chunk.documentId).toBe("doc-yuksek");
    expect(groups[1][0].chunk.documentId).toBe("doc-dusuk");
  });

  it("boş liste -> boş dizi döner", () => {
    expect(groupMatchesByDocument([])).toEqual([]);
  });
});
