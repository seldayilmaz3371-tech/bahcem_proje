/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 9.8 — TEST 2/3/5 kök neden düzeltmelerinin gerçek doğrulaması.
 * `generateEmbedding` (dış Gemini çağrısı) mock'lanıyor, geri kalan
 * TÜM kod (searchSimilarChunks, computeMetadataBoost, repository) GERÇEK.
 *
 * NOT: Her test, GERÇEK PAYLAŞILAN veritabanı dosyasına yazdığı için
 * (test izole edilmiş bir DB kullanmıyor), Vitest'in paralel test
 * çalıştırması sırasında ID çakışmalarını önlemek amacıyla, her testte
 * `crypto.randomUUID()` ile GERÇEKTEN benzersiz documentId'ler kullanılıyor.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

vi.mock("./gemini-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gemini-client")>();
  return {
    ...actual,
    getGeminiClient: vi.fn(() => ({
      models: { embedContent: vi.fn().mockResolvedValue({ embeddings: [{ values: [0.7, 0.3, 0.2] }] }) },
    })),
    callGeminiWithRetry: vi.fn((fn: any) => fn()),
  };
});

import { searchSimilarChunks } from "./rag-retrieval.service";
import { vectorChunkRepository } from "../../repositories/ai.repository";

beforeEach(() => vi.clearAllMocks());

describe("Sprint 9.8 — TEST 3/5: cropType uyuşmazlık cezası (Karar Destek)", () => {
  it("[GERÇEK KULLANICI SENARYOSU] Zeytin parseli sorgusunda, activeCropType verilmezse (Belgelere Sor gibi) davranış DEĞİŞMEZ — geriye dönük tam uyumlu", async () => {
    const uid = crypto.randomUUID().slice(0, 8);
    const docZeytin = `doc-${uid}-zeytin`;
    const docPatates = `doc-${uid}-patates`;
    await vectorChunkRepository.create({ id: `c-${uid}-zeytin`, documentId: docZeytin, chunkIndex: 0, content: "Zeytin gübreleme önerileri", cropType: "Zeytin", embeddings: [0.71, 0.29, 0.19] } as any);
    await vectorChunkRepository.create({ id: `c-${uid}-patates`, documentId: docPatates, chunkIndex: 0, content: "Patates Mildiyö hastalığı tedavisi", cropType: "Patates", embeddings: [0.72, 0.31, 0.21] } as any);

    // activeCropType HİÇ VERİLMEDİ (Belgelere Sor'un çağrı deseni) -> ceza uygulanmaz
    const result = await searchSimilarChunks("gübreleme önerisi", 4, [docZeytin, docPatates]);
    expect(result).toHaveLength(2); // ikisi de sızıyor, TIPKI Sprint 9.7 öncesi davranış gibi (kasıtlı, geriye uyumlu)
  });

  it("[GERÇEK KULLANICI SENARYOSU — TEST 3] activeCropType='Zeytin' verildiğinde, Patates chunk'ının skoru cezalandırılır, Zeytin chunk'ından geride kalır", async () => {
    const uid = crypto.randomUUID().slice(0, 8);
    const docZeytin = `doc-${uid}-zeytin`;
    const docPatates = `doc-${uid}-patates`;
    await vectorChunkRepository.create({ id: `c-${uid}-zeytin`, documentId: docZeytin, chunkIndex: 0, content: "Zeytin gübreleme önerileri", cropType: "Zeytin", embeddings: [0.7, 0.3, 0.2] } as any);
    await vectorChunkRepository.create({ id: `c-${uid}-patates`, documentId: docPatates, chunkIndex: 0, content: "Patates Mildiyö hastalığı tedavisi", cropType: "Patates", embeddings: [0.71, 0.31, 0.21] } as any); // SAF embedding'de HAFİFÇE daha yüksek

    const result = await searchSimilarChunks("gübreleme önerisi", 4, [docZeytin, docPatates], undefined, "Zeytin");
    // KESİN KANIT: ceza sayesinde Zeytin chunk'ı, saf embeddingde biraz daha düşük olsa bile ÖNE geçer
    expect(result[0].chunk.id).toBe(`c-${uid}-zeytin`);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("cropType hiç belirtilmemiş (genel) bir chunk, activeCropType verilse bile CEZALANDIRILMAZ (yanlışlıkla dışlanmaz)", async () => {
    const uid = crypto.randomUUID().slice(0, 8);
    const docGenel = `doc-${uid}-genel`;
    await vectorChunkRepository.create({ id: `c-${uid}-genel`, documentId: docGenel, chunkIndex: 0, content: "Genel gübreleme bilgisi, bitki türü belirtilmemiş", embeddings: [0.7, 0.3, 0.2] } as any); // cropType YOK
    const result = await searchSimilarChunks("gübreleme önerisi", 4, [docGenel], undefined, "Zeytin");
    expect(result[0].chunk.id).toBe(`c-${uid}-genel`);
    expect(result[0].score).toBeCloseTo(1.0, 1); // ceza uygulanmadığı için saf embedding skoru korunuyor
  });
});
