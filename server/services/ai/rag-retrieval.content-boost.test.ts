/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 9.13 — TEST 3 kök neden düzeltmesinin gerçek doğrulaması.
 * "10.5.40+ME" sorgusunda, bu terimi content'inde İÇEREN chunk'ın,
 * içermeyen (alakasız) bir chunk'a karşı artık ek bir boost aldığını
 * gerçek kodla kanıtlar.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

vi.mock("./gemini-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gemini-client")>();
  return {
    ...actual,
    getGeminiClient: vi.fn(() => ({
      models: { embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [0.6, 0.4, 0.3] }] }) },
    })),
    callGeminiWithRetry: vi.fn((fn: any) => fn()),
  };
});

import { searchSimilarChunks } from "./rag-retrieval.service";
import { vectorChunkRepository } from "../../repositories/ai.repository";

beforeEach(() => vi.clearAllMocks());

describe("Sprint 9.13 — TEST 3: content bazlı metadata boost (alakasız chunk'ları geride bırakma)", () => {
  it("[GERÇEK KULLANICI SENARYOSU] '10.5.40+ME' sorgusunda, bu terimi İÇERİK'te barındıran chunk, barındırmayan (Domates) chunk'tan öne geçer", async () => {
    const uid = crypto.randomUUID().slice(0, 8);
    const docUrun = `doc-${uid}-urun`;
    const docDomates = `doc-${uid}-domates`;
    // Aynı SAF embedding skoruna sahip iki chunk — biri content'inde "10.5.40+ME" geçiyor, diğeri (Domates) hiç geçmiyor
    await vectorChunkRepository.create({ id: `c-${uid}-urun`, documentId: docUrun, chunkIndex: 0, content: "10.5.40+ME ürünü için kullanım dozu tablosu aşağıdadır.", embeddings: [0.6, 0.4, 0.3] } as any);
    await vectorChunkRepository.create({ id: `c-${uid}-domates`, documentId: docDomates, chunkIndex: 0, content: "Domates-Biber-Patlıcan-Hıyar için gübreleme dozu tablosu aşağıdadır.", embeddings: [0.6, 0.4, 0.3] } as any);

    const before = await searchSimilarChunks("10.5.40+ME gübresinin kullanım dozu nedir?", 4, [docUrun, docDomates]);
    expect(before[0].score).toBeCloseTo(before[1].score, 5); // metadataBoostQuery YOKSA fark yok

    const after = await searchSimilarChunks("10.5.40+ME gübresinin kullanım dozu nedir?", 4, [docUrun, docDomates], "10.5.40+ME gübresinin kullanım dozu nedir?");
    expect(after[0].chunk.id).toBe(`c-${uid}-urun`); // KESİN KANIT: content'inde "10.5.40" geçen chunk öne çıkıyor
    expect(after[0].score).toBeGreaterThan(after[1].score);
  });

});
