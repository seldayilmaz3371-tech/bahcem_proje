/**
 * SADECE TEŞHİS ARACI (v4) — hiçbir üretim kodu değiştirilmedi.
 *
 * Amaç: Kullanıcı sorusu → Embedding → Vector Search → Ranking → Top-K
 * → Context Assembly → Prompt Construction zincirinin HER adımını,
 * GERÇEK fonksiyonları (searchSimilarChunks, buildChatAssistantPrompt)
 * hiç değiştirmeden çağırarak göstermek. Gemini'ye GERÇEKTEN istek
 * göndermiyor (API maliyeti/anahtarı gerektirmez) — yalnızca Gemini'ye
 * GÖNDERİLECEK OLAN son prompt metnini, üretim kodunun ürettiği HALİYLE,
 * hiçbir kısaltma yapmadan gösteriyor.
 *
 * Çalıştırma: proje kök dizininde
 *   npx tsx debug-prompt-construction.ts "Mutifa WG domates mildiyösünde ilaçlamaya ne zaman başlanmalıdır?"
 */
import { searchSimilarChunks } from "./server/services/ai/rag-retrieval.service";
import { buildChatAssistantPrompt } from "./server/prompts/chat-assistant.prompt";
import { capUserQueryLength } from "./server/prompts/prompt-safety.util";
import { uploadedDocumentRepository } from "./server/repositories/ai.repository";

// Üretim kodundaki (chat-assistant.service.ts) GERÇEK sabit — burada
// yalnızca GÖRÜNTÜLEMEK için kopyalandı.
const REAL_TOP_K = 3;
const REAL_MIN_RELEVANT_SIMILARITY_SCORE = 0.55;

async function main() {
  const query = process.argv[2] || "Mutifa WG domates mildiyösünde ilaçlamaya ne zaman başlanmalıdır?";

  console.log("========================================================");
  console.log("ADIM: KULLANICI SORUSU");
  console.log("========================================================");
  console.log(query);

  // chat-assistant.service.ts'teki GERÇEK ilk adım — soru uzunluğu
  // sınırlama. Kısa sorgularda görünür bir etkisi olmaz ama tam
  // sadakat için (üretim akışının BİREBİR aynısı) burada da uygulanıyor.
  const safeQuery = capUserQueryLength(query);

  // ------------------------------------------------------------------
  // ADIM: Vector Search + Ranking + Top-K (GERÇEK fonksiyon, aynen çağrılıyor)
  // ------------------------------------------------------------------
  const matches = await searchSimilarChunks(safeQuery, REAL_TOP_K);

  console.log("\n========================================================");
  console.log(`ADIM: TOP-${REAL_TOP_K} (searchSimilarChunks() gerçek çıktısı)`);
  console.log("========================================================");
  for (let i = 0; i < matches.length; i++) {
    const { chunk, score } = matches[i];
    const doc = await uploadedDocumentRepository.getById(chunk.documentId);
    console.log(`\n#${i + 1} | Skor: ${score.toFixed(6)} | Doküman: '${doc?.fileName}' | Heading: ${chunk.heading ?? "(yok)"}`);
    console.log(`İçerik: ${chunk.content.substring(0, 200)}...`);
  }

  // MADDE 1: Top-K chunk'ları gerçekten Gemini'ye gönderiliyor mu, yoksa filtreleniyor mu?
  // — chat-assistant.service.ts'teki GERÇEK mantık aynen tekrarlanıyor (kod
  // satır satır kopyalanmadı, yalnızca AYNI karar birebir yeniden uygulanıyor):
  console.log("\n========================================================");
  console.log("MADDE 1: TOP-K CHUNK'LARI GERÇEKTEN GEMINI'YE GİDİYOR MU?");
  console.log("========================================================");
  const hasRelevantMatch = matches.length > 0 && matches[0].score >= REAL_MIN_RELEVANT_SIMILARITY_SCORE;
  const webFallbackEnabled = !hasRelevantMatch;
  console.log(`hasRelevantMatch: ${hasRelevantMatch} (en yüksek skor ${matches[0]?.score.toFixed(6)} >= eşik ${REAL_MIN_RELEVANT_SIMILARITY_SCORE} mi?)`);
  console.log(`webFallbackEnabled: ${webFallbackEnabled}`);
  if (hasRelevantMatch) {
    console.log(`SONUÇ: Top-${REAL_TOP_K}'daki TÜM chunk'lar (${matches.length} adet) FİLTRELENMEDEN prompt'a dahil ediliyor — chat-assistant.service.ts'te bu chunk'ları eleyen ek bir filtre YOK.`);
  } else {
    console.log("SONUÇ: hasRelevantMatch=false olduğu için ragContext'e 'Eşleşen spesifik bir döküman bulunamadı.' yazılıyor, gerçek chunk içerikleri prompt'a HİÇ dahil edilmiyor.");
  }

  // ------------------------------------------------------------------
  // ADIM + MADDE 2, 3, 4, 5, 6, 7: Context Assembly + Prompt Construction
  // (chat-assistant.service.ts'teki GERÇEK ragContext inşa mantığı,
  // birebir aynı formülle yeniden üretiliyor — searchSimilarChunks
  // GERÇEK sonucu üzerinden)
  // ------------------------------------------------------------------
  const ragContext = matches.length > 0
    ? matches.map((m, idx) => `[Referans ${idx + 1}]: ${m.chunk.content}`).join("\n\n")
    : "Eşleşen spesifik bir döküman bulunamadı.";

  console.log("\n========================================================");
  console.log("MADDE 2: GEMINI'YE GÖNDERİLEN CONTEXT'İN TAM METNİ (ragContext)");
  console.log("========================================================");
  console.log(ragContext);

  console.log("\n========================================================");
  console.log("MADDE 3: PROMPT'TA documentId/documentName/heading/metadata/source VAR MI?");
  console.log("========================================================");
  const containsDocId = /documentId|document id/i.test(ragContext);
  const containsHeadingLabel = /heading:/i.test(ragContext);
  console.log(`ragContext metninde 'documentId' etiketi geçiyor mu: ${containsDocId ? "EVET" : "HAYIR"}`);
  console.log(`ragContext metninde 'heading:' etiketi geçiyor mu: ${containsHeadingLabel ? "EVET" : "HAYIR"}`);
  console.log("Kod incelemesi (chat-assistant.service.ts): ragContext yalnızca `[Referans N]: ${chunk.content}` formülüyle inşa ediliyor — chunk.documentId, chunk.heading, chunk.topics, chunk.keywords hiçbiri bu formüle dahil edilmiyor.");

  console.log("\n========================================================");
  console.log("MADDE 4: LLM, TOP-K CHUNK'LARIN AYNI DOKÜMANA AİT OLDUĞUNU ANLAYABİLİR Mİ?");
  console.log("========================================================");
  const uniqueDocIds = new Set(matches.map((m) => m.chunk.documentId));
  console.log(`Bu ${matches.length} chunk, ${uniqueDocIds.size} farklı dokümana ait.`);
  console.log("Prompt'ta doküman kimliği/adı hiç geçmediği için (bkz. Madde 3), LLM bu chunk'ların aynı dokümana ait olup olmadığını AYIRT EDEMEZ — yalnızca numaralandırılmış, kaynağı belirtilmemiş metin blokları olarak görür.");

  console.log("\n========================================================");
  console.log("MADDE 5: 'MUTIFA WG' İLE İLGİLİ CHUNK'LAR ARASINDA CONTEXT ASSEMBLY SIRASINDA BAĞ KURULUYOR MU?");
  console.log("========================================================");
  console.log("Kod incelemesi: ragContext inşası yalnızca `matches.map(...).join(\"\\n\\n\")` — chunk'lar arasında hiçbir anlamsal/başlık/doküman bazlı gruplama, ilişkilendirme veya çapraz referans YAPILMIYOR. Her chunk bağımsız bir metin bloğu olarak ekleniyor.");

  console.log("\n========================================================");
  console.log("MADDE 6: 'ÜRÜN ADI CHUNK İÇİNDE GEÇMİYORSA CEVAP VERME' KURALI VAR MI?");
  console.log("========================================================");
  console.log("Böyle AÇIK bir kural yok. Ama chat-assistant.prompt.ts'te şu DOLAYLI kural var (tam metin):");
  console.log(`"Yalnızca yukarıdaki bilgi deposu referanslarına dayan; bu referanslarda yer almayan hiçbir bilgiyi (genel eğitim verinden veya varsayımdan) cevaba dahil etme. Bilgi deposunda eşleşen bir kaynak yoksa bunu açıkça belirt; var olmayan bir referanstan alıntı yapıyormuş gibi davranma."`);

  console.log("\n========================================================");
  console.log("MADDE 7: GEMINI'YE GÖNDERİLECEK SON PROMPT'UN TAM METNİ (KISALTILMADAN)");
  console.log("========================================================");
  const finalPrompt = buildChatAssistantPrompt(ragContext, safeQuery, undefined, webFallbackEnabled);
  console.log(finalPrompt);
}

main().catch((e) => {
  console.error("Debug betiği hata verdi:", e);
  process.exit(1);
});
