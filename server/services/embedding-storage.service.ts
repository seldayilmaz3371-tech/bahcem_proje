/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { config } from "../config";
import { logger } from "../logger";
import { db } from "../database";
import { vectorChunkRepository } from "../repositories/ai.repository";

/**
 * Embedding Storage Service.
 *
 * Persists RAG (Retrieval-Augmented Generation) vector embeddings as
 * individual files on disk, rather than embedding the raw floating-point
 * arrays inline inside the main JSON database. Each embedding vector
 * (~768 numbers, several kilobytes of JSON per document chunk) previously
 * lived directly inside the `vectorChunks` table of the single JSON
 * database file. As more documents were uploaded to the "RAG Doküman
 * Havuzu", this made the database file — and therefore every single
 * database write anywhere in the application, even one completely
 * unrelated to documents — progressively larger and slower to
 * re-serialize and persist to disk on every change.
 *
 * This mirrors the same architectural pattern already applied to
 * field-observation photos via `PhotoStorageService`: the lightweight
 * `VectorChunk` record (id, documentId, chunkIndex, content) remains in
 * the main database with its `embeddings` field set to an empty array,
 * while the actual embedding vector is stored in
 * `data/embeddings/<chunkId>.json` and read back on demand whenever a
 * similarity search needs it.
 *
 * Note: moving embeddings out of the JSON database does not by itself
 * speed up RAG similarity search or Gemini API latency — search still
 * requires loading every relevant embedding into memory to compute
 * similarity scores. What this change improves is the size and write
 * speed of the primary database file, which benefits every operation in
 * the system as the document/chunk collection grows, exactly as photo
 * storage did for image uploads.
 */
export class EmbeddingStorageService {
  private readonly embeddingsDirectory: string;

  constructor() {
    this.embeddingsDirectory = path.join(path.dirname(path.resolve(config.database.path)), "embeddings");
    this.ensureDirectoryExists();
  }

  /**
   * Ensures the on-disk embeddings directory exists, creating it (and any
   * missing parent directories) if necessary.
   */
  private ensureDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.embeddingsDirectory)) {
        fs.mkdirSync(this.embeddingsDirectory, { recursive: true });
        logger.info("RAG", `Embedding depolama klasörü oluşturuldu: ${this.embeddingsDirectory}`);
      }
    } catch (error) {
      logger.error("RAG", "Embedding depolama klasörü oluşturulamadı.", error, { path: this.embeddingsDirectory });
      throw error;
    }
  }

  /**
   * Resolves the absolute file path for a given chunk's embedding file.
   */
  private getEmbeddingFilePath(chunkId: string): string {
    return path.join(this.embeddingsDirectory, `${chunkId}.json`);
  }

  /**
   * Writes a chunk's embedding vector to its own file on disk, using an
   * atomic write-then-rename pattern so an interrupted write can never
   * leave a corrupted/partial embedding file behind.
   * @param embedding The raw floating-point embedding vector
   * @param chunkId The VectorChunk record's unique identifier
   * @throws Error if the file cannot be written
   */
  public saveEmbedding(embedding: number[], chunkId: string): void {
    const finalPath = this.getEmbeddingFilePath(chunkId);
    const tempPath = `${finalPath}.tmp`;

    try {
      fs.writeFileSync(tempPath, JSON.stringify(embedding), "utf8");
      fs.renameSync(tempPath, finalPath);
    } catch (error) {
      logger.error("RAG", "Embedding diske yazılırken hata oluştu.", error, { chunkId });
      throw new Error("Embedding vektörü diske kaydedilirken bir hata oluştu.");
    }
  }

  /**
   * Reads a previously saved embedding vector from disk for the given
   * chunk. Returns null if no embedding file exists for that chunk (for
   * example, a legacy chunk that has not yet been migrated and still
   * carries its embedding inline in the database record — callers should
   * fall back to the chunk's own `embeddings` field in that case).
   * @param chunkId The VectorChunk record's unique identifier
   */
  public readEmbedding(chunkId: string): number[] | null {
    try {
      const filePath = this.getEmbeddingFilePath(chunkId);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content) as number[];
    } catch (error) {
      logger.error("RAG", "Embedding diskten okunurken hata oluştu.", error, { chunkId });
      return null;
    }
  }

  /**
   * Deletes the on-disk embedding file for a given chunk, if one exists.
   * Safe to call even if no file was ever created for that chunk (e.g. a
   * legacy, not-yet-migrated chunk).
   * @param chunkId The VectorChunk record's unique identifier
   */
  public deleteEmbedding(chunkId: string): void {
    try {
      const filePath = this.getEmbeddingFilePath(chunkId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      logger.error("RAG", "Embedding dosyası silinirken bir hata oluştu.", error, { chunkId });
    }
  }

  /**
   * One-time startup migration: scans all VectorChunk records for any
   * that still carry their embedding vector inline (a non-empty
   * `embeddings` array — the legacy storage format used before this
   * service existed), writes each one to its own file on disk, and
   * clears the inline array in the database record. Idempotent — chunks
   * already migrated (with an empty inline `embeddings` array) are left
   * untouched, and running this again after all legacy chunks have been
   * converted has no further effect.
   * @returns The number of chunk records that were successfully migrated
   */
  public async migrateAllLegacyEmbeddings(): Promise<number> {
    const rawDb = await db.readRaw();
    const legacyChunks = (rawDb.vectorChunks || []).filter((chunk) => chunk.embeddings.length > 0);

    if (legacyChunks.length === 0) {
      return 0;
    }

    logger.warn(
      "RAG",
      `${legacyChunks.length} adet eski (veritabanı dosyasına gömülü) embedding tespit edildi, dosya sistemine taşınıyor...`
    );

    let migratedCount = 0;
    for (const chunk of legacyChunks) {
      try {
        this.saveEmbedding(chunk.embeddings, chunk.id);
        await vectorChunkRepository.update(chunk.id, { embeddings: [] });
        migratedCount++;
      } catch (error) {
        logger.error(
          "RAG",
          `Eski embedding taşınamadı, kayıt olduğu gibi bırakıldı. Chunk ID: ${chunk.id}`,
          error
        );
      }
    }

    logger.info(
      "RAG",
      `Embedding taşıma tamamlandı: ${migratedCount}/${legacyChunks.length} kayıt başarıyla dosya sistemine taşındı.`
    );
    return migratedCount;
  }
}

export const embeddingStorageService = new EmbeddingStorageService();
