/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { AITask, AIRecommendation, UploadedDocument, VectorChunk } from "../models";
import { db } from "../database";

/**
 * Repository to manage AITasks.
 */
export class AITaskRepository extends BaseRepository<AITask> {
  constructor() {
    super("aiTasks");
  }
}

/**
 * Repository to manage Decision-Support AI Recommendations.
 */
export class AIRecommendationRepository extends BaseRepository<AIRecommendation> {
  constructor() {
    super("aiRecommendations");
  }

  /**
   * Retrieves AI insights generated for a specific land parcel.
   */
  public async getByParcelId(parcelId: string): Promise<AIRecommendation[]> {
    return this.find((r) => r.parcelId === parcelId);
  }
}

/**
 * Repository to manage RAG Documents uploaded by the farmer.
 */
export class UploadedDocumentRepository extends BaseRepository<UploadedDocument> {
  constructor() {
    super("uploadedDocuments");
  }

  /**
   * Safe check to verify if a filename is already registered.
   */
  public async getByFileName(fileName: string): Promise<UploadedDocument | null> {
    return this.findOne((doc) => doc.fileName === fileName);
  }

  /**
   * Retrieves documents scoped to a specific entity (e.g. all manuals
   * uploaded for one piece of equipment), as opposed to the general
   * shared knowledge base.
   */
  public async getByLinkedEntity(entityType: "equipment", entityId: string): Promise<UploadedDocument[]> {
    return this.find((doc) => doc.linkedEntityType === entityType && doc.linkedEntityId === entityId);
  }
}

/**
 * Repository to manage vectorized Text Chunks for RAG retrieval.
 */
export class VectorChunkRepository extends BaseRepository<VectorChunk> {
  constructor() {
    super("vectorChunks");
  }

  /**
   * Retrieves all processed chunks belonging to a document.
   */
  public async getByDocumentId(documentId: string): Promise<VectorChunk[]> {
    return this.find((chunk) => chunk.documentId === documentId);
  }

  /**
   * Deletes all chunk records associated with an unlinked document.
   */
  public async deleteByDocumentId(documentId: string): Promise<number> {
    let deletedCount = 0;
    await db.transaction((rawDb) => {
      const initialLength = rawDb.vectorChunks.length;
      rawDb.vectorChunks = rawDb.vectorChunks.filter((chunk) => chunk.documentId !== documentId);
      deletedCount = initialLength - rawDb.vectorChunks.length;
    });
    return deletedCount;
  }
}

export const aiTaskRepository = new AITaskRepository();
export const aiRecommendationRepository = new AIRecommendationRepository();
export const uploadedDocumentRepository = new UploadedDocumentRepository();
export const vectorChunkRepository = new VectorChunkRepository();
