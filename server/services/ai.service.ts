/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ==========================================================================
// AI SERVICE FACADE
//
// This file intentionally contains no business logic of its own. Each AI
// capability (document ingestion, parcel recommendations, chat, photo
// diagnosis, growth analysis) lives in its own module under ./ai, and RAG
// concerns (chunking, embedding, retrieval) are isolated from all of them
// in ./ai/rag-retrieval.service — per the project's AI-layer isolation
// principle (RAG, Embedding, Retrieval and Prompt management each managed
// independently).
//
// `aiService` re-exposes the exact same public method signatures the rest
// of the codebase (server.ts) already depends on, so this split changes
// nothing from the caller's perspective — no call site elsewhere needed
// to change.
// ==========================================================================

import { documentService } from "./ai/document.service";
import { parcelRecommendationService } from "./ai/parcel-recommendation.service";
import { chatAssistantService } from "./ai/chat-assistant.service";
import { photoAnalysisService } from "./ai/photo-analysis.service";
import { growthAnalysisService } from "./ai/growth-analysis.service";

export const aiService = {
  processDocument: documentService.processDocument.bind(documentService),
  removeDocument: documentService.removeDocument.bind(documentService),
  computeDocumentContentHash: documentService.computeContentHash.bind(documentService),
  findDuplicateDocumentByContentHash: documentService.findDuplicateByContentHash.bind(documentService),
  generateParcelRecommendation: parcelRecommendationService.generateParcelRecommendation.bind(parcelRecommendationService),
  queryChatAssistant: chatAssistantService.queryChatAssistant.bind(chatAssistantService),
  analyzePhotoOnce: photoAnalysisService.analyzePhotoOnce.bind(photoAnalysisService),
  generateGrowthAnalysis: growthAnalysisService.generateGrowthAnalysis.bind(growthAnalysisService),
};

// Re-exported for backward compatibility: these RAG primitives were
// previously defined at module scope directly in this file. Nothing in
// the current codebase imports them from here (verified before this
// refactor), but they are kept available under their original path in
// case of external/future usage.
export { generateEmbedding, chunkText, cosineSimilarity, searchSimilarChunks } from "./ai/rag-retrieval.service";
export { getGeminiClient } from "./ai/gemini-client";
