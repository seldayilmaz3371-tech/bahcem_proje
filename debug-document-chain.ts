/**
 * SADECE TEŞHİS ARACI (v3) — hiçbir üretim kodu değiştirilmedi.
 *
 * Amaç: Verilen documentId'nin TÜM chunk'larını sırayla (chunkIndex'e
 * göre) listeleyip, "Mutifa WG" etiketinin ile gerçek ürün bilgisinin
 * (doz, hasat süresi, arı, başlama zamanı, etki şekli) FARKLI chunk'lara
 * dağılıp dağılmadığını kanıtlamak.
 *
 * NOT: Mevcut VectorChunk modelinde açık bir "parent chunk" alanı YOK
 * (bu, kod tabanında doğrulanmış bir gerçek, varsayım değil) — bu
 * yüzden "parent ilişkisi" yerine, elimizde GERÇEKTEN olan tek bağlam
 * bilgisini (chunkIndex'e göre önceki/sonraki chunk) gösteriyoruz.
 *
 * Çalıştırma: proje kök dizininde
 *   npx tsx debug-document-chain.ts ac314f24-0e85-499f-9ea6-22e209d5ccd2 "Mutifa WG domates mildiyösünde ilaçlamaya ne zaman başlanmalıdır?"
 */
import { generateEmbedding, cosineSimilarity } from "./server/services/ai/rag-retrieval.service";
import { uploadedDocumentRepository, vectorChunkRepository } from "./server/repositories/ai.repository";
import { embeddingStorageService } from "./server/services/embedding-storage.service";

async function main() {
  const documentId = process.argv[2] || "ac314f24-0e85-499f-9ea6-22e209d5ccd2";
  const query = process.argv[3] || "Mutifa WG domates mildiyösünde ilaçlamaya ne zaman başlanmalıdır?";

  const doc = await uploadedDocumentRepository.getById(documentId);
  console.log("========================================================");
  console.log(`DOKÜMAN: '${doc?.fileName ?? "(bulunamadı)"}'  (ID: ${documentId})`);
  console.log("========================================================");

  const allChunks = await vectorChunkRepository.getAll();
  const docChunks = allChunks
    .filter((c) => c.documentId === documentId)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);

  console.log(`Bu dokümana ait toplam chunk sayısı: ${docChunks.length}\n`);

  // ------------------------------------------------------------------
  // MADDE 1: Tüm chunk'ları sırayla listele.
  // ------------------------------------------------------------------
  console.log("========================================================");
  console.log("MADDE 1: TÜM CHUNK'LAR (chunkIndex sırasıyla)");
  console.log("========================================================");
  for (let i = 0; i < docChunks.length; i++) {
    const c = docChunks[i];
    const prev = docChunks[i - 1];
    const next = docChunks[i + 1];
    console.log(`\n--- chunkIndex: ${c.chunkIndex} (chunkVersion: ${c.chunkVersion ?? "yok"}) ---`);
    console.log(`Heading         : ${c.heading ?? "(yok)"}`);
    console.log(`Chunk Uzunluğu  : ${c.content.length}`);
    console.log(`İlk 300 karakter: ${c.content.substring(0, 300)}`);
    console.log(`Son 150 karakter: ${c.content.substring(Math.max(0, c.content.length - 150))}`);
    console.log(`Önceki chunk (chunkIndex ${prev ? prev.chunkIndex : "yok"}): ${prev ? `heading="${prev.heading ?? "(yok)"}", son 80 karakteri: "${prev.content.substring(Math.max(0, prev.content.length - 80))}"` : "(bu ilk chunk)"}`);
    console.log(`Sonraki chunk (chunkIndex ${next ? next.chunkIndex : "yok"}): ${next ? `heading="${next.heading ?? "(yok)"}", ilk 80 karakteri: "${next.content.substring(0, 80)}"` : "(bu son chunk)"}`);
    console.log(`NOT: VectorChunk modelinde 'parent' alanı yok (kod tabanında doğrulandı) — yalnızca chunkIndex komşuluğu gösteriliyor.`);
  }

  // ------------------------------------------------------------------
  // MADDE 2: Anahtar bilgiler hangi chunk'ta? (düz metin arama, yorum yok)
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("MADDE 2: ANAHTAR BİLGİLERİN HANGİ CHUNK'TA OLDUĞU (düz metin arama)");
  console.log("========================================================");
  const searchTerms: Record<string, RegExp> = {
    "Aktif Madde": /aktif madde|metiram|cymoxanil/i,
    "Hasat Süresi": /hasat|gün.*bekle|son ilaçlama/i,
    "Arı": /arı/i,
    "Başlama Zamanı": /başlan|ilaçlamaya.*başla/i,
    "Doz": /doz|100 lt|litre/i,
    "Etki Şekli": /etki şekli|antisporulant|koruyucu etki/i,
  };
  for (const [label, pattern] of Object.entries(searchTerms)) {
    const foundIn = docChunks.filter((c) => pattern.test(c.content));
    console.log(`${label}: ${foundIn.length > 0 ? foundIn.map((c) => `chunkIndex ${c.chunkIndex}`).join(", ") : "HİÇBİR CHUNK'TA BULUNAMADI"}`);
  }

  // ------------------------------------------------------------------
  // MADDE 3: "başlanmalıdır" veya eşdeğeri hangi chunk'ta?
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("MADDE 3: 'İLAÇLAMAYA BAŞLANMALIDIR' VEYA EŞDEĞERİ");
  console.log("========================================================");
  const timingPattern = /başlan|ilaçlamaya.*başla|uygulamaya.*başla/i;
  const timingChunks = docChunks.filter((c) => timingPattern.test(c.content));
  if (timingChunks.length === 0) {
    console.log("Bu ifadeyi (veya eşdeğerini) içeren hiçbir chunk bulunamadı — yalnızca loglanıyor, yorumlanmıyor.");
  } else {
    for (const c of timingChunks) {
      console.log(`\nchunkIndex ${c.chunkIndex} (heading: "${c.heading ?? "(yok)"}") içeriyor:`);
      console.log(c.content);
    }
  }

  // ------------------------------------------------------------------
  // MADDE 4: Bu chunk(lar)ın gerçek similarity skoru ve genel sıralaması.
  // ------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("MADDE 4: BU CHUNK'IN SORGU İÇİN SKORU VE GENEL SIRALAMASI");
  console.log("========================================================");
  if (timingChunks.length > 0) {
    const queryEmbedding = await generateEmbedding(query);
    const allScored = allChunks.map((chunk) => {
      const chunkEmbedding = embeddingStorageService.readEmbedding(chunk.id) ?? chunk.embeddings;
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
      return { chunk, score };
    });
    allScored.sort((a, b) => b.score - a.score);

    for (const c of timingChunks) {
      const entry = allScored.find((s) => s.chunk.id === c.id);
      const rank = allScored.findIndex((s) => s.chunk.id === c.id) + 1;
      console.log(`chunkIndex ${c.chunkIndex}: Skor = ${entry?.score.toFixed(6)}, Genel sıralama = #${rank} / ${allScored.length}`);
    }
  } else {
    console.log("Madde 3'te hiçbir chunk bulunamadığı için skor hesaplanamadı.");
  }
}

main().catch((e) => {
  console.error("Debug betiği hata verdi:", e);
  process.exit(1);
});
