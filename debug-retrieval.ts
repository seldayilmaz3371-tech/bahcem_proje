/**
 * SADECE TEŞHİS ARACI — hiçbir üretim kodu değiştirilmedi.
 *
 * Bu betik, mevcut retrieval/generation akışını (searchSimilarChunks,
 * generateEmbedding, queryChatAssistant) OLDUĞU GİBİ, hiçbir satırına
 * dokunmadan içe aktarıp çağırıyor — yalnızca aradaki adımları
 * (embedding üretimi, aday chunk sayısı, Top-K sonuçları, eşik kararı,
 * nihai LLM cevabı) görünür kılıyor.
 *
 * Çalıştırma: proje kök dizininde
 *   npx tsx debug-retrieval.ts "Mutifa WG domates mildiyösünde ilaçlamaya ne zaman başlanmalıdır?"
 *
 * Argüman verilmezse, sorunun bildirildiği varsayılan sorguyu kullanır.
 */
import { generateEmbedding, searchSimilarChunks } from "./server/services/ai/rag-retrieval.service";
import { chatAssistantService } from "./server/services/ai/chat-assistant.service";
import { uploadedDocumentRepository, vectorChunkRepository } from "./server/repositories/ai.repository";

// Üretim kodundaki (chat-assistant.service.ts) GERÇEK sabitler — burada
// yalnızca GÖRÜNTÜLEMEK için kopyalandı, retrieval/ranking kararı hâlâ
// tamamen gerçek fonksiyonlar tarafından veriliyor.
const REAL_TOP_K = 3;
const REAL_MIN_RELEVANT_SIMILARITY_SCORE = 0.55;

async function main() {
  const query = process.argv[2] || "Mutifa WG domates mildiyösünde ilaçlamaya ne zaman başlanmalıdır?";

  console.log("========================================================");
  console.log("1. KULLANICININ GERÇEK SORGUSU");
  console.log("========================================================");
  console.log(query);

  console.log("\n========================================================");
  console.log("2. SORGU EMBEDDING'İ ÜRETİLDİ Mİ?");
  console.log("========================================================");
  let queryEmbedding: number[] = [];
  try {
    queryEmbedding = await generateEmbedding(query);
    const isBlank = queryEmbedding.every((v) => v === 0);
    console.log(`Sonuç: ${isBlank ? "❌ HAYIR — 768 sıfırdan oluşan sahte (blank fallback) embedding döndü" : "✅ EVET"}`);
    console.log(`Boyut: ${queryEmbedding.length}, ilk 3 değer: [${queryEmbedding.slice(0, 3).join(", ")}]`);
  } catch (e) {
    console.log("❌ HATA — embedding üretimi exception fırlattı:", e);
  }

  console.log("\n========================================================");
  console.log("3. searchSimilarChunks()'A KAÇ CHUNK GİRDİ?");
  console.log("========================================================");
  const allChunks = await vectorChunkRepository.getAll();
  console.log(`Veritabanındaki toplam chunk sayısı (documentIds filtresi uygulanmadan önce): ${allChunks.length}`);

  console.log("\n========================================================");
  console.log("4. FİLTRELEME UYGULANDI MI?");
  console.log("========================================================");
  console.log("Genel sohbet asistanı (queryChatAssistant), documentIds parametresini undefined olarak çağırıyor.");
  console.log("Bu, server/services/ai/chat-assistant.service.ts satır 105'te doğrudan görülebilir: `searchSimilarChunks(safeQuery, 3, documentIds)`.");
  console.log("Sonuç: Şu an hiçbir metadata (heading/topics/keywords/cropType) filtrelemesi UYGULANMIYOR — bu, Sprint 2D'nin henüz yapılmamış olmasının doğal sonucu.");
  console.log(`Kullanılan Top-K (limit) değeri: ${REAL_TOP_K}`);

  console.log("\n========================================================");
  console.log(`5. TOP-${REAL_TOP_K} SONUÇLARIN TAMAMI (gerçek searchSimilarChunks() çağrısı)`);
  console.log("========================================================");
  const matches = await searchSimilarChunks(query, REAL_TOP_K);

  if (matches.length === 0) {
    console.log("Hiçbir sonuç dönmedi (searchSimilarChunks boş dizi döndürdü).");
  }

  for (let i = 0; i < matches.length; i++) {
    const { chunk, score } = matches[i];
    const doc = await uploadedDocumentRepository.getById(chunk.documentId);
    console.log(`\n--- Sıra ${i + 1} ---`);
    console.log(`Similarity Skoru : ${score}`);
    console.log(`Document ID      : ${chunk.documentId}`);
    console.log(`Doküman Adı      : ${doc?.fileName ?? "(doküman kaydı bulunamadı)"}`);
    console.log(`Heading          : ${chunk.heading ?? "(yok)"}`);
    console.log(`Topics           : ${JSON.stringify(chunk.topics ?? [])}`);
    console.log(`Keywords         : ${JSON.stringify(chunk.keywords ?? [])}`);
    console.log(`Chunk ID         : ${chunk.id}`);
    console.log(`Chunk Uzunluğu   : ${chunk.content.length}`);
    console.log(`İlk 250 karakter : ${chunk.content.substring(0, 250)}`);
    // Nesnel, tahmin içermeyen bir metin araması — "mutifa" kelimesi
    // chunk içeriğinde geçiyor mu, geçmiyor mu (yorum yapılmadan).
    const containsMutifa = chunk.content.toLowerCase().includes("mutifa");
    console.log(`"mutifa" kelimesi içeriyor mu (düz metin arama) : ${containsMutifa ? "EVET" : "HAYIR"}`);
  }

  console.log("\n========================================================");
  console.log("6. 'MUTIFA' İÇEREN CHUNK TOP-K İÇİNDE VAR MI?");
  console.log("========================================================");
  const mutifaInTopK = matches.some((m) => m.chunk.content.toLowerCase().includes("mutifa"));
  console.log(mutifaInTopK ? "✅ EVET — Top-K sonuçları arasında 'mutifa' kelimesini içeren en az bir chunk var." : "❌ HAYIR — Top-K sonuçları arasında 'mutifa' kelimesini içeren hiçbir chunk yok. (Neden burada açıklanmıyor, yalnızca loglanıyor.)");

  console.log("\n========================================================");
  console.log("7-8. EŞİK KARARI: DOĞRU CHUNK TOP-K'DA OLSA BİLE LLM'E YANSIYOR MU?");
  console.log("========================================================");
  const topScore = matches.length > 0 ? matches[0].score : 0;
  const hasRelevantMatch = matches.length > 0 && topScore >= REAL_MIN_RELEVANT_SIMILARITY_SCORE;
  console.log(`En yüksek skor: ${topScore}`);
  console.log(`Eşik (MIN_RELEVANT_SIMILARITY_SCORE): ${REAL_MIN_RELEVANT_SIMILARITY_SCORE}`);
  console.log(`hasRelevantMatch: ${hasRelevantMatch}`);
  if (!hasRelevantMatch) {
    console.log("❌ SONUÇ: En yüksek skor eşiğin altında kaldığı için, RAG sonuçları TAMAMEN GÖRMEZDEN GELİNİYOR ve web arama fallback'i devreye giriyor —");
    console.log("   bu, Top-K içinde doğru chunk bulunsa bile (bkz. madde 6), LLM'in prompt'una hiç dahil edilmediği anlamına gelir.");
  } else {
    console.log("✅ SONUÇ: Eşik geçildi, RAG sonuçları LLM'in prompt'una dahil edilecek.");
  }

  console.log("\n========================================================");
  console.log("EK: GERÇEK queryChatAssistant() ÇAĞRISI (tam uçtan uca, hiç değiştirilmeden)");
  console.log("========================================================");
  const finalResult = await chatAssistantService.queryChatAssistant(query);
  console.log(`usedChunks.length : ${finalResult.usedChunks.length} (0 ise, RAG hiç kullanılmadı demektir)`);
  console.log(`LLM Cevabı (ilk 500 karakter):\n${finalResult.text.substring(0, 500)}`);
}

main().catch((e) => {
  console.error("Debug betiği hata verdi:", e);
  process.exit(1);
});
