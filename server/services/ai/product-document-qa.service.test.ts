/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7H — ProductDocumentQaService Test Süiti.
 *
 * Bağımlılıklar (`rag-retrieval.service`, `gemini-client`,
 * `ai.repository`) `vi.mock()` ile izole edilir — mevcut Sprint 6B/6C
 * deseniyle tutarlı, gerçek database.ts/Gemini API'sine hiç dokunulmaz.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repositories/ai.repository", () => ({
  uploadedDocumentRepository: {
    getByLinkedEntity: vi.fn(),
    getById: vi.fn(),
  },
  vectorChunkRepository: {
    getAll: vi.fn(),
  },
}));

vi.mock("./rag-retrieval.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rag-retrieval.service")>();
  return {
    ...actual, // filterRelevantMatches (saf fonksiyon) GERÇEK implementasyonuyla çalışır
    searchSimilarChunks: vi.fn(),
    expandWithDocumentContext: vi.fn((matches) => Promise.resolve(matches)),
    expandWithAdjacentChunks: vi.fn((matches) => Promise.resolve(matches)),
  };
});

vi.mock("./gemini-client", () => ({
  getGeminiClient: vi.fn(() => ({
    models: { generateContent: vi.fn() },
  })),
  callGeminiWithRetry: vi.fn(),
}));

vi.mock("../ai-usage-tracker.service", () => ({
  aiUsageTrackerService: { recordUsage: vi.fn() },
}));

import { ProductDocumentQaService } from "./product-document-qa.service";
import { uploadedDocumentRepository, vectorChunkRepository } from "../../repositories/ai.repository";
import { searchSimilarChunks } from "./rag-retrieval.service";
import { callGeminiWithRetry } from "./gemini-client";

const mockDocRepo = vi.mocked(uploadedDocumentRepository);
const mockVectorChunkRepo = vi.mocked(vectorChunkRepository);
const mockSearchSimilarChunks = vi.mocked(searchSimilarChunks);
const mockCallGeminiWithRetry = vi.mocked(callGeminiWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
  mockVectorChunkRepo.getAll.mockResolvedValue([]); // Sprint 9.24 — varsayılan: kritik bölüm garantisi hiçbir şey eklemez
});

function fakeChunk(overrides: Partial<any> = {}) {
  return {
    id: "chunk-1",
    documentId: "doc-1",
    chunkIndex: 0,
    content: "Bu ürün 20°C altında saklanmalıdır.",
    embeddings: [],
    heading: "Saklama Koşulları",
    ...overrides,
  };
}

describe("ProductDocumentQaService.ask", () => {
  it("[SPRINT 9.12] hiç bağlı belge yoksa VE genel aramada da hiçbir şey bulunamazsa -> doğru mesaj döner, hasLinkedDocuments=false", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([]);
    mockSearchSimilarChunks.mockResolvedValue([]); // genel (scope'suz) arama da sonuç vermedi
    const service = new ProductDocumentQaService();

    const outcome = await service.ask("product-1", "Bu ürün nasıl saklanır?");

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.answer).toContain("bulunamadı");
      expect(outcome.result.hasLinkedDocuments).toBe(false);
    }
    expect(mockCallGeminiWithRetry).not.toHaveBeenCalled(); // gereksiz API çağrısı yok
    // KESİN KANIT: searchSimilarChunks artık ÇAĞRILIYOR (erken dönüş YOK), documentIds=undefined (genel havuz) ile
    expect(mockSearchSimilarChunks).toHaveBeenCalledWith("Bu ürün nasıl saklanır?", 4, undefined, "Bu ürün nasıl saklanır?");
  });

  it("[SPRINT 9.12 — GERÇEK KULLANICI SENARYOSU] productId eşleşmiyor ('10 5 40') AMA genel semantik aramada ilgili chunk bulunuyorsa -> Gemini'ye gönderilir, hasLinkedDocuments=false ama cevap üretilir", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([]); // "10 5 40" ile eşleşen ürün/belge yok
    mockSearchSimilarChunks.mockResolvedValue([{ chunk: fakeChunk({ documentId: "doc-genel", content: "10.5.40+ME kullanım dozu 250-300 g/dekar." }), score: 0.82 }]);
    mockCallGeminiWithRetry.mockResolvedValue({ text: '{"answer": "Doz 250-300 g/dekar.", "confidence": 0.8, "citations": [], "warnings": []}' } as any);

    const service = new ProductDocumentQaService();
    const outcome = await service.ask("10 5 40", "İçeriği ve dozajı nedir?");

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.answer).toBe("Doz 250-300 g/dekar.");
      expect(outcome.result.hasLinkedDocuments).toBe(false); // dürüstçe: gerçek ürün bağlantısı yoktu
    }
    expect(mockCallGeminiWithRetry).toHaveBeenCalled(); // KESİN KANIT: artık Gemini'ye ULAŞIYOR (öncesinde erken dönüşte hiç ulaşmazdı)
  });

  it("[SPRINT 9.12] productId hiç gönderilmese bile (boş string) genel semantik RAG çalışır", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([]);
    mockSearchSimilarChunks.mockResolvedValue([]);
    const service = new ProductDocumentQaService();
    await service.ask("", "Genel bir soru");
    expect(mockSearchSimilarChunks).toHaveBeenCalledWith("Genel bir soru", 4, undefined, "Genel bir soru");
  });

  it("[GERİYE DÖNÜK UYUMLULUK] ürün tam eşleşiyorsa (linkedDocuments dolu), eski davranış BİREBİR AYNI — documentIds SCOPE'LU çağrılır", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([{ id: "doc-1", fileName: "test.pdf" } as any]);
    mockSearchSimilarChunks.mockResolvedValue([{ chunk: fakeChunk(), score: 0.85 }]);
    mockCallGeminiWithRetry.mockResolvedValue({ text: '{"answer": "Cevap.", "confidence": 0.8, "citations": [], "warnings": []}' } as any);

    const service = new ProductDocumentQaService();
    await service.ask("product-1", "Soru");

    // KESİN KANIT: documentIds hâlâ SCOPE'LU geçiliyor (["doc-1"]), undefined DEĞİL — eski davranış korunuyor
    expect(mockSearchSimilarChunks).toHaveBeenCalledWith("Soru", 4, ["doc-1"], "Soru");
  });

  it("[İlgisiz belge elendi] belge var ama eşleşme skoru düşükse -> 'Belgelerde bu bilgi bulunamadı', Gemini'ye istek atılmaz", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([{ id: "doc-1", fileName: "test.pdf" } as any]);
    mockSearchSimilarChunks.mockResolvedValue([{ chunk: fakeChunk(), score: 0.2 }]); // eşik altı

    const service = new ProductDocumentQaService();
    const outcome = await service.ask("product-1", "Alakasız bir soru");

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.answer).toBe("Belgelerde bu bilgi bulunamadı.");
      expect(outcome.result.hasLinkedDocuments).toBe(true);
    }
    expect(mockCallGeminiWithRetry).not.toHaveBeenCalled();
  });

  it("[İlgili belge bulundu + Chunk seçimi + Context Builder + Prompt Builder + AI cevap üretiyor + Confidence doğru hesaplanıyor] tam akış", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([{ id: "doc-1", fileName: "urun-etiketi.pdf" } as any]);
    mockDocRepo.getById.mockResolvedValue({ id: "doc-1", fileName: "urun-etiketi.pdf" } as any);
    mockSearchSimilarChunks.mockResolvedValue([{ chunk: fakeChunk(), score: 0.85 }]); // eşik üstü

    mockCallGeminiWithRetry.mockResolvedValue({
      text: '{"answer": "20°C altında serin ve kuru bir yerde saklayın.", "confidence": 0.9, "citations": [{"documentId": "doc-1", "excerpt": "20°C altında"}], "warnings": []}',
    } as any);

    const service = new ProductDocumentQaService();
    const outcome = await service.ask("product-1", "Bu ürün nasıl saklanır?");

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result.answer).toContain("20°C");
      expect(outcome.result.confidence).toBe(0.9);
      // [Kaynak belgeler doğru listeleniyor]
      expect(outcome.result.usedDocuments).toHaveLength(1);
      expect(outcome.result.usedDocuments[0].fileName).toBe("urun-etiketi.pdf");
      expect(outcome.result.usedDocuments[0].heading).toBe("Saklama Koşulları");
      // [SORUN 3] Retrieval Score gerçek veriden geliyor, uydurulmuyor
      expect(outcome.result.usedDocuments[0].retrievalScore).toBe(0.85);
      expect(outcome.result.citations[0].documentId).toBe("doc-1");
    }
    // searchSimilarChunks yalnızca bu ürüne bağlı belge ID'leriyle SINIRLANDIRILARAK çağrıldı (Chunk Selection doğru çalışıyor)
    expect(mockSearchSimilarChunks).toHaveBeenCalledWith("Bu ürün nasıl saklanır?", 4, ["doc-1"], "Bu ürün nasıl saklanır?");
  });

  it("[API hata yönetimi] Gemini sağlayıcı hatası fırlatırsa -> throw ETMEZ, success:false döner", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([{ id: "doc-1", fileName: "test.pdf" } as any]);
    mockSearchSimilarChunks.mockResolvedValue([{ chunk: fakeChunk(), score: 0.85 }]);
    mockCallGeminiWithRetry.mockRejectedValue(new Error("Simüle edilmiş Gemini hatası"));

    const service = new ProductDocumentQaService();
    const outcome = await service.ask("product-1", "Test sorusu");

    expect(outcome.success).toBe(false);
  });

  it("[API hata yönetimi] Gemini bozuk JSON döndürürse -> success:false döner, sistem çökmez", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([{ id: "doc-1", fileName: "test.pdf" } as any]);
    mockSearchSimilarChunks.mockResolvedValue([{ chunk: fakeChunk(), score: 0.85 }]);
    mockCallGeminiWithRetry.mockResolvedValue({ text: "gecersiz json {{{" } as any);

    const service = new ProductDocumentQaService();
    const outcome = await service.ask("product-1", "Test sorusu");

    expect(outcome.success).toBe(false);
  });

  it("boş soru -> validation hatası, hiçbir repository/Gemini çağrılmaz", async () => {
    const service = new ProductDocumentQaService();
    const outcome = await service.ask("product-1", "");

    expect(outcome.success).toBe(false);
    expect(mockDocRepo.getByLinkedEntity).not.toHaveBeenCalled();
  });

  it("[GERÇEK KULLANICI SENARYOSU — RAG filtreleme düzeltmesi] documentIds içinde biri yüksek-skorlu (alakalı), biri düşük-skorlu (alakasız, örn. yanlışlıkla bağlanmış başka ürün belgesi) chunk varsa -> yalnızca alakalı olan prompt'a gider, düşük skorlu chunk ELENİR", async () => {
    mockDocRepo.getByLinkedEntity.mockResolvedValue([
      { id: "doc-urun-ozeti", fileName: "10.5.40+ME — Ürün Özeti" } as any,
      { id: "doc-mantar-ilaci", fileName: "Domates_Kabak_Kavun_Karpuz_Mantar_Ilaci.pdf" } as any, // yanlışlıkla bağlanmış, alakasız
    ]);
    mockDocRepo.getById.mockImplementation((id: string) =>
      Promise.resolve(id === "doc-urun-ozeti" ? ({ id, fileName: "10.5.40+ME — Ürün Özeti" } as any) : ({ id, fileName: "Domates_Kabak_Kavun_Karpuz_Mantar_Ilaci.pdf" } as any))
    );
    // searchSimilarChunks GERÇEKTE HER İKİ belgenin chunk'ını da (documentIds
    // filtresi geçtikleri için) döndürür — biri yüksek (0.821), biri DÜŞÜK
    // (0.35, eşiğin altında) skorla. Kullanıcının gerçek gözlemiyle birebir.
    mockSearchSimilarChunks.mockResolvedValue([
      { chunk: fakeChunk({ id: "chunk-ozet", documentId: "doc-urun-ozeti", content: "Marka: GÜBRETAŞ, NPK: 10-5-40" }), score: 0.821 },
      { chunk: fakeChunk({ id: "chunk-mantar", documentId: "doc-mantar-ilaci", content: "Hıyar Kabak Kavun Karpuz Bağ Domates Patates" }), score: 0.35 },
    ]);
    mockCallGeminiWithRetry.mockResolvedValue({
      text: '{"answer": "Bu ürüne ait kullanım alanı ve doz bilgisi bağlı belgelerde bulunmamaktadır.", "confidence": 0.5, "citations": [{"documentId": "doc-urun-ozeti"}], "warnings": []}',
    } as any);

    const service = new ProductDocumentQaService();
    const outcome = await service.ask("product-1", "10 5 40 me gübresi nerelerde ve hangi dozajlarda kullanılır");

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      // KESİN KANIT: mantar ilacı belgesi usedDocuments'te YOK
      expect(outcome.result.usedDocuments).toHaveLength(1);
      expect(outcome.result.usedDocuments[0].documentId).toBe("doc-urun-ozeti");
      expect(outcome.result.usedDocuments.some((d) => d.fileName.includes("Mantar"))).toBe(false);
    }

    // Gemini'ye gerçekten tek bir çağrı yapıldığını doğrula
    expect(mockCallGeminiWithRetry).toHaveBeenCalledTimes(1);
  });
});
