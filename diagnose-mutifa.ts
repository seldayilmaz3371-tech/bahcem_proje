/**
 * Sprint 2C regresyon teşhis betiği (ESM uyumlu sürüm).
 *
 * Amaç: "Mutifa WG" (veya adında "Mutifa" geçen) dokümanın chunk'larını
 * ve GERÇEK embedding dosyalarını inceleyip, iki soruyu kesin olarak
 * cevaplamak:
 *   1. Bu chunk'lar Sprint 2C SONRASI mı üretildi (topics/keywords dolu mu)?
 *   2. Herhangi bir chunk'ın embedding'i "sahte" (768 sıfırdan oluşan
 *      fallback) mi kalmış?
 *
 * Çalıştırma: proje kök dizininde
 *   npx tsx diagnose-mutifa.ts
 */
import fs from "fs";
import path from "path";

// ESM'de __dirname yok. Betik proje kök dizininden çalıştırılacağı için
// (talimatta belirtildiği gibi) process.cwd() — komutun çalıştırıldığı
// klasör — burada yeterli ve en güvenilir yöntem; import.meta.url'e
// dayalı bir çözüme gerek yok.
const PROJECT_ROOT = process.cwd();

const DB_PATH = path.join(PROJECT_ROOT, "data", "tarim_hafizasi.json");
const EMBEDDINGS_DIR = path.join(PROJECT_ROOT, "data", "embeddings");

if (!fs.existsSync(DB_PATH)) {
  console.error(`HATA: Veritabanı dosyası bulunamadı: ${DB_PATH}`);
  console.error("Bu betiği proje kök dizininden (server.ts'in bulunduğu klasörden) çalıştırdığınızdan emin olun.");
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

const targetDocs = (db.uploadedDocuments || []).filter((d: any) =>
  (d.fileName || "").toLowerCase().includes("mutifa")
);

if (targetDocs.length === 0) {
  console.log("UYARI: Adında 'Mutifa' geçen hiçbir doküman bulunamadı. Dosya adını kontrol edin.");
  process.exit(0);
}

for (const doc of targetDocs) {
  console.log(`\n=== Doküman: '${doc.fileName}' (ID: ${doc.id}) ===`);
  console.log(`  Yükleme tarihi: ${doc.uploadDate}`);
  console.log(`  cropType: ${doc.cropType ?? "(yok)"}`);

  const chunks = (db.vectorChunks || [])
    .filter((c: any) => c.documentId === doc.id)
    .sort((a: any, b: any) => a.chunkIndex - b.chunkIndex);

  console.log(`  Chunk sayısı: ${chunks.length}`);

  for (const c of chunks) {
    const hasSprint2CFields = c.topics !== undefined || c.keywords !== undefined;
    const embeddingFile = path.join(EMBEDDINGS_DIR, `${c.id}.json`);
    let embeddingStatus = "DOSYA BULUNAMADI";
    if (fs.existsSync(embeddingFile)) {
      const raw = JSON.parse(fs.readFileSync(embeddingFile, "utf8"));
      const values: number[] = Array.isArray(raw) ? raw : raw.values || raw.embeddings || [];
      const allZero = values.length > 0 && values.every((v) => v === 0);
      embeddingStatus = allZero
        ? "❌ SAHTE (768 SIFIR) — bu chunk retrieval'da asla bulunamaz"
        : `✅ gerçek embedding (${values.length} boyut, ilk değer: ${values[0]})`;
    }

    console.log(`\n  Chunk ${c.chunkIndex}: heading="${c.heading}"`);
    console.log(`    Sprint 2C alanları var mı (topics/keywords): ${hasSprint2CFields ? "EVET (2C sonrası üretilmiş)" : "HAYIR (2B veya öncesi)"}`);
    console.log(`    İçerik başı: ${(c.content || "").substring(0, 100)}...`);
    console.log(`    Embedding durumu: ${embeddingStatus}`);
  }
}
