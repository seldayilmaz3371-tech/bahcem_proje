/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 9.9 — TEST 1 kök neden düzeltmesinin gerçek doğrulaması.
 * `useMetadataBoost: true`'nun Karar Destek'te aktifleşmesi, kullanıcının
 * sorgusundaki terimlerin (örn. ürün adı) chunk'ların heading alanıyla
 * eşleştiğinde boost sağladığını GERÇEK kodla kanıtlar.
 *
 * NOT: Gerçek, paylaşılan veritabanı dosyasına yazıldığı için (izole
 * test DB'si yok), Vitest'in paralel çalıştırması sırasında ID
 * çakışmalarını önlemek amacıyla `crypto.randomUUID()` ile GERÇEKTEN
 * benzersiz documentId'ler kullanılıyor.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

vi.mock("./gemini-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gemini-client")>();
  return {
    ...actual,
    getGeminiClient: vi.fn(() => ({
      models: { embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [0.5, 0.5, 0.5] }] }) },
    })),
    callGeminiWithRetry: vi.fn((fn: any) => fn()),
  };
});

import { searchSimilarChunks } from "./rag-retrieval.service";
import { vectorChunkRepository } from "../../repositories/ai.repository";

beforeEach(() => vi.clearAllMocks());

describe("Sprint 9.9 — TEST 1: Karar Destek metadataBoost (useMetadataBoost aktifleşmesi)", () => {
  it("[GERÇEK KULLANICI SENARYOSU] '10.5.40+ME' sorgusunda, heading'inde bu ürün adı geçen chunk, metadataBoostQuery VERİLDİĞİNDE öne çıkar", async () => {
    const uid = crypto.randomUUID().slice(0, 8);
    const docUrun = `doc-${uid}-urun`;
    const docAlakasiz = `doc-${uid}-alakasiz`;
    // Aynı saf embedding skoruna sahip iki chunk — biri ürüne özel heading'e sahip, diğeri alakasız
    await vectorChunkRepository.create({ id: `c-${uid}-urun`, documentId: docUrun, chunkIndex: 0, content: "Kullanım dozu bilgisi burada", heading: "10.5.40+ME Kullanım Dozları", embeddings: [0.5, 0.5, 0.5] } as any);
    await vectorChunkRepository.create({ id: `c-${uid}-alakasiz`, documentId: docAlakasiz, chunkIndex: 0, content: "Genel gübreleme dozu bilgisi burada", heading: "Genel Gübreleme Bilgisi", embeddings: [0.5, 0.5, 0.5] } as any);

    // metadataBoostQuery VERİLMEDEN (Sprint 9.9 ÖNCESİ Karar Destek davranışı) -> eşit skor, sıralama belirsiz
    const before = await searchSimilarChunks("10.5.40+ME gübresi hakkında kullanım dozları", 4, [docUrun, docAlakasiz]);
    expect(before[0].score).toBeCloseTo(before[1].score, 5); // fark yok

    // metadataBoostQuery VERİLDİĞİNDE (Sprint 9.9 SONRASI, useMetadataBoost:true ile context-builder'ın davranışı)
    const after = await searchSimilarChunks("10.5.40+ME gübresi hakkında kullanım dozları", 4, [docUrun, docAlakasiz], "10.5.40+ME gübresi hakkında kullanım dozları");
    expect(after[0].chunk.id).toBe(`c-${uid}-urun`); // KESİN KANIT: ürüne özel chunk artık öne çıkıyor
    expect(after[0].score).toBeGreaterThan(after[1].score);
  });
});
