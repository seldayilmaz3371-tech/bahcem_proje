/**
 * SADECE TEŞHİS ARACI (v2) — hiçbir üretim kodu değiştirilmedi.
 *
 * Amaç: "Mutifa WG" ile ilgili TÜM chunk'ların, verilen sorgu için GERÇEK
 * similarity skorlarını (yalnızca Top-3 değil, hepsini) hesaplayıp,
 * neden Top-3'e giremediklerini (veya girdilerse nerede olduklarını)
 * kanıtla göstermek. Ayrıca Top-3'ü KAZANAN chunk'ların hangi dokümana
 * ait olduğunu da gösteriyor — rakip bir doküman olup olmadığını
 * netleştirmek için.
 *
 * Çalıştırma: proje kök dizininde
 *   npx tsx debug-mutifa-deep.ts "Mutifa WG domates mildiyösünde ilaçlamaya ne zaman başlanmalıdır?"
 */
import { generateEmbedding, searchSimilarChunks, cosineSimilarity } from "./server/services/ai/rag-retrieval.service";
import { uploadedDocumentRepository, vectorChunkRepository } from "./server/repositories/ai.repository";
import { embeddingStorageService } from "./server/services/embedding-storage.service";

const REAL_TOP_K = 3;
const REAL_MIN_RELEVANT_SIMILARITY_SCORE = 0.55;

async function main() {
  const query = process.argv[2] || "Mutifa WG domates mildiyösünde ilaçlamaya ne zaman başlanmalıdır?";

  console.log("========================================================");
  console.log("SORGU");
  console.log("========================================================");
  console.log(query);

  // ------------------------------------------------------------------
  // MADDE 1: "Mutifa" ile ilgili tüm dokümanları ve chunk'larını bul.
  // Hem dosya adında hem chunk içeriğinde "mutifa" araması yapılıyor —
  // hangi dosyada olduğuna dair varsayım yapılmıyor.
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("MADDE 1: 'Mutifa' İLE İLGİLİ TÜM DOKÜMAN VE CHUNK'LAR");
  console.log("========================================================");

  const allDocs = await uploadedDocumentRepository.getAll();
  const allChunks = await vectorChunkRepository.getAll();

  const mutifaChunks = allChunks.filter((c) => c.content.toLowerCase().includes("mutifa"));
  const mutifaDocIds = new Set(mutifaChunks.map((c) => c.documentId));

  console.log(`"mutifa" kelimesini içeren toplam chunk sayısı: ${mutifaChunks.length}`);
  console.log(`Bu chunk'ların ait olduğu benzersiz doküman sayısı: ${mutifaDocIds.size}`);

  for (const docId of mutifaDocIds) {
    const doc = allDocs.find((d) => d.id === docId);
    console.log(`\n--- Doküman: '${doc?.fileName}' (ID: ${docId}) ---`);
  }

  console.log("\nHer 'mutifa' içeren chunk için ayrıntı:");
  for (const chunk of mutifaChunks) {
    const doc = allDocs.find((d) => d.id === chunk.documentId);
    const hasEmbeddingFile = embeddingStorageService.readEmbedding(chunk.id) !== null;
    const embeddingValues = embeddingStorageService.readEmbedding(chunk.id) ?? chunk.embeddings;
    const embeddingLooksValid = Array.isArray(embeddingValues) && embeddingValues.length > 0 && !embeddingValues.every((v) => v === 0);

    console.log(`\n  Chunk ID       : ${chunk.id}`);
    console.log(`  Doküman        : ${doc?.fileName}`);
    console.log(`  chunkVersion   : ${chunk.chunkVersion ?? "(yok — Sprint 2A öncesi)"}`);
    console.log(`  Heading        : ${chunk.heading ?? "(yok)"}`);
    console.log(`  Chunk Uzunluğu : ${chunk.content.length}`);
    console.log(`  İlk 300 karakter: ${chunk.content.substring(0, 300)}`);
    console.log(`  Topics         : ${JSON.stringify(chunk.topics ?? [])}`);
    console.log(`  Keywords       : ${JSON.stringify(chunk.keywords ?? [])}`);
    console.log(`  Embedding dosyası var mı: ${hasEmbeddingFile ? "EVET" : "HAYIR (kayıt içi/eksik)"}`);
    console.log(`  Embedding geçerli mi (sıfır değil): ${embeddingLooksValid ? "EVET" : "HAYIR — SAHTE/BOŞ EMBEDDING"}`);
    // Madde 4'ün ön hazırlığı — bu chunk zamanlama/doz bilgisi içeriyor mu?
    const mentionsTiming = /başlan|gün|ilaçlama zaman/i.test(chunk.content);
    console.log(`  Zamanlama/doz ile ilgili kelime içeriyor mu ("başlan"/"gün"/"ilaçlama zaman"): ${mentionsTiming ? "EVET" : "HAYIR"}`);
  }

  // ------------------------------------------------------------------
  // MADDE 2: Bu sorgu için TÜM "mutifa" chunk'larının gerçek skorunu hesapla
  // (yalnızca Top-3 değil, tamamı).
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("MADDE 2: TÜM 'MUTIFA' CHUNK'LARININ BU SORGU İÇİN SKORU");
  console.log("========================================================");

  const queryEmbedding = await generateEmbedding(query);
  const mutifaScored = mutifaChunks.map((chunk) => {
    const chunkEmbedding = embeddingStorageService.readEmbedding(chunk.id) ?? chunk.embeddings;
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
    return { chunk, score };
  });
  mutifaScored.sort((a, b) => b.score - a.score);

  for (const { chunk, score } of mutifaScored) {
    console.log(`Skor: ${score.toFixed(6)} | Chunk ID: ${chunk.id} | Heading: ${chunk.heading ?? "(yok)"} | İlk 80 karakter: ${chunk.content.substring(0, 80)}`);
  }

  // ------------------------------------------------------------------
  // MADDE 3: Bu skorları, TÜM veritabanındaki (3776) chunk'lar arasında
  // sıralayınca kaçıncı sırada olduklarını göster — Top-3'e ne kadar
  // uzak/yakın olduklarını somutlaştırmak için.
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("MADDE 3: TÜM VERİTABANI SIRALAMASINDA MUTIFA CHUNK'LARININ YERİ");
  console.log("========================================================");

  const allScored = allChunks.map((chunk) => {
    const chunkEmbedding = embeddingStorageService.readEmbedding(chunk.id) ?? chunk.embeddings;
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
    return { chunk, score };
  });
  allScored.sort((a, b) => b.score - a.score);

  console.log(`Toplam chunk sayısı (sıralamaya dahil): ${allScored.length}`);
  for (const { chunk } of mutifaScored) {
    const rank = allScored.findIndex((s) => s.chunk.id === chunk.id) + 1;
    const doc = allDocs.find((d) => d.id === chunk.documentId);
    console.log(`Chunk ID ${chunk.id} (${doc?.fileName}) → GENEL SIRALAMADA #${rank} / ${allScored.length}`);
  }

  console.log("\n--- Karşılaştırma için gerçek Top-3 kazananları (ve dokümanları) ---");
  for (let i = 0; i < REAL_TOP_K; i++) {
    const { chunk, score } = allScored[i];
    const doc = allDocs.find((d) => d.id === chunk.documentId);
    console.log(`#${i + 1} | Skor: ${score.toFixed(6)} | Doküman: '${doc?.fileName}' (ID: ${chunk.documentId}) | Heading: ${chunk.heading ?? "(yok)"} | chunkVersion: ${chunk.chunkVersion ?? "(yok)"}`);
  }

  // ------------------------------------------------------------------
  // MADDE 4: Zamanlama bilgisini içeren spesifik chunk'ı öne çıkar.
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("MADDE 4: ZAMANLAMA BİLGİSİNİ İÇEREN MUTIFA CHUNK'I");
  console.log("========================================================");
  const timingChunk = mutifaScored.find(({ chunk }) => /başlan/i.test(chunk.content));
  if (timingChunk) {
    const rank = allScored.findIndex((s) => s.chunk.id === timingChunk.chunk.id) + 1;
    console.log(`Bulundu — Chunk ID: ${timingChunk.chunk.id}`);
    console.log(`Skor: ${timingChunk.score.toFixed(6)}`);
    console.log(`Genel sıralamadaki yeri: #${rank} / ${allScored.length} (Top-${REAL_TOP_K}'e girmesi için ilk ${REAL_TOP_K} arasında olması gerekir)`);
    console.log(`İçerik: ${timingChunk.chunk.content.substring(0, 400)}`);
  } else {
    console.log("'başlan' kelimesini içeren bir 'mutifa' chunk'ı bulunamadı — bu, doğrudan loglanıyor, yorumlanmıyor.");
  }

  // ------------------------------------------------------------------
  // MADDE 5: Sprint 2B/2C bu dokümanı etkiledi mi?
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("MADDE 5: SPRINT 2B/2C BU DOKÜMANI (MUTIFA WG) ETKİLEDİ Mİ?");
  console.log("========================================================");
  const anyHasHeading = mutifaChunks.some((c) => c.heading !== undefined);
  const anyHasChunkVersion = mutifaChunks.some((c) => c.chunkVersion !== undefined);
  console.log(`Mutifa chunk'larından herhangi birinde 'heading' var mı: ${anyHasHeading ? "EVET" : "HAYIR"}`);
  console.log(`Mutifa chunk'larından herhangi birinde 'chunkVersion' var mı: ${anyHasChunkVersion ? "EVET" : "HAYIR"}`);
  console.log(anyHasChunkVersion
    ? "SONUÇ: Bu doküman Sprint 2A/2B/2C sonrasında (yeniden) işlenmiş."
    : "SONUÇ: Bu doküman Sprint 2A/2B/2C'den ÖNCE yüklenmiş ve hiç yeniden işlenmemiş — eski, karakter-bazlı chunk yapısını taşıyor.");
}

main().catch((e) => {
  console.error("Debug betiği hata verdi:", e);
  process.exit(1);
});
