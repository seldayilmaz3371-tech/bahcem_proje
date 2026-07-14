/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { uploadedDocumentRepository, vectorChunkRepository } from "../../repositories/ai.repository";
import { logger } from "../../logger";
import { config } from "../../config";
import { UploadedDocument } from "../../models";
import { embeddingStorageService } from "../embedding-storage.service";
import { aiUsageTrackerService } from "../ai-usage-tracker.service";
import { buildDocumentSummaryPrompt } from "../../prompts/document-summary.prompt";
import { getGeminiClient, callGeminiWithRetry } from "./gemini-client";
import { chunkText, generateEmbedding } from "./rag-retrieval.service";

/**
 * Manages the lifecycle of RAG knowledge-base documents: ingestion
 * (chunk + embed + summarize) and removal.
 */
export class DocumentService {
  /**
   * Computes a stable SHA-256 hash of a document's raw text content.
   * Whitespace/casing differences still produce different hashes
   * deliberately — this catches exact re-uploads (e.g. clicking upload
   * twice, or re-adding the same file next month by mistake), not
   * "similar" documents, which would require a much fuzzier (and less
   * predictable) comparison than a farmer would expect from a simple
   * "already added?" warning.
   */
  public computeContentHash(textContent: string): string {
    return crypto.createHash("sha256").update(textContent, "utf8").digest("hex");
  }

  /**
   * Looks for an already-uploaded document with identical text content.
   * Used to warn (not silently block) before re-indexing the same
   * content a second time — see the "forceUpload" override on the
   * upload route, which lets the user proceed anyway if they genuinely
   * want a second copy.
   */
  public async findDuplicateByContentHash(contentHash: string): Promise<UploadedDocument | null> {
    const all = await uploadedDocumentRepository.getAll();
    return all.find((doc) => doc.contentHash === contentHash) || null;
  }

  /**
   * Registers a document, generates overlapping text chunks, vectorizes them,
   * and populates the local vector database.
   *
   * @param linkedEntityType Optional scoping tag (see UploadedDocument).
   *   Pass "equipment" with linkedEntityId when this document is a
   *   specific equipment's manual, so it can later be searched in
   *   isolation from the general knowledge base. Omit both for a normal
   *   general-purpose RAG document (unchanged default behavior).
   */
  public async processDocument(
    uploadedBy: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    textContent: string,
    linkedEntityType?: "equipment",
    linkedEntityId?: string
  ): Promise<UploadedDocument | null> {
    try {
      // Step 1: Create uploaded document entry
      const timestamp = new Date().toISOString();
      const newDoc = await uploadedDocumentRepository.create({
        fileName,
        fileType,
        fileSize,
        uploadedBy,
        uploadDate: timestamp,
        linkedEntityType,
        linkedEntityId,
        contentHash: this.computeContentHash(textContent),
      });

      // Step 2: Split text into overlapping segments
      const textChunks = chunkText(textContent);

      // Step 3: Embed each chunk, persist the (large) embedding vector to
      // its own file on disk, and save only a lightweight record (id,
      // content, chunk index) in the main database.
      for (let i = 0; i < textChunks.length; i++) {
        const chunkTextContent = textChunks[i];
        let embeddings: number[] = [];
        try {
          embeddings = await generateEmbedding(chunkTextContent);
        } catch (e) {
          logger.error("RAG", `Embedding failed for chunk index ${i}. Using blank fallback embeddings.`, e);
          embeddings = new Array(768).fill(0); // Blank embedding fallback to avoid hard crashes
        }

        const chunkId = crypto.randomUUID();
        embeddingStorageService.saveEmbedding(embeddings, chunkId);

        await vectorChunkRepository.create({
          id: chunkId,
          documentId: newDoc.id,
          chunkIndex: i,
          content: chunkTextContent,
          embeddings: [],
        });
      }

      // Step 4: Generate a summary of the document using Gemini
      try {
        const client = getGeminiClient();
        const summaryResponse = await callGeminiWithRetry(() => {
          aiUsageTrackerService.recordUsage(config.ai.generationModel);
          return client.models.generateContent({
            model: config.ai.generationModel,
            contents: buildDocumentSummaryPrompt(textContent),
          });
        });
        if (summaryResponse.text) {
          await uploadedDocumentRepository.update(newDoc.id, {
            summary: summaryResponse.text.trim(),
          });
          newDoc.summary = summaryResponse.text.trim();
        }
      } catch (sumErr) {
        logger.error("RAG", "Could not generate automated summary for document.", sumErr);
      }

      logger.info("RAG", `Successfully processed and indexed document: '${fileName}' into ${textChunks.length} chunks.`);
      return newDoc;
    } catch (error) {
      logger.error("RAG", "Fatal error processing uploaded document.", error);
      return null;
    }
  }

  /**
   * Unlinks a document and cleans up its vector chunks database.
   */
  public async removeDocument(documentId: string): Promise<boolean> {
    try {
      const docExists = await uploadedDocumentRepository.getById(documentId);
      if (!docExists) return false;

      // Delete each chunk's on-disk embedding file before removing the
      // lightweight chunk records themselves.
      const chunksToDelete = await vectorChunkRepository.getByDocumentId(documentId);
      for (const chunk of chunksToDelete) {
        embeddingStorageService.deleteEmbedding(chunk.id);
      }

      await vectorChunkRepository.deleteByDocumentId(documentId);
      await uploadedDocumentRepository.delete(documentId);

      logger.info("RAG", `Document and its vector index unlinked: ID: '${documentId}'`);
      return true;
    } catch (error) {
      logger.error("RAG", "Failed to delete document from registry.", error);
      return false;
    }
  }
}

export const documentService = new DocumentService();
