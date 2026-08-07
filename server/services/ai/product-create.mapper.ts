/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fertilizer, Chemical, AiExtractedLabelMeta } from "../../models";
import { ProductCreateRequest } from "./product-create-request.types";

/**
 * Sprint 7F — Mapper katmanı. Tek sorumluluğu: `ProductCreateRequest`'i,
 * `fertilizerRepository.create()`/`chemicalRepository.create()`'in
 * beklediği şekle çevirmek. KARAR VERMEZ (validasyon, dedup, InventoryItem
 * oluşturma — hepsi `ProductCreateService`'te) — yalnızca veri dönüşümü.
 * Route içinde bu mantığın bulunmaması için ayrıştırıldı (bkz. Sprint 7F
 * mimari kuralı).
 */

/** `sourceAnalysisConfidence` verildiyse, mevcut (Sprint 7A) `aiExtractedLabel` alanını doldurur — bkz. product-create-request.types.ts, "Değerlendirme 2". */
function buildAiExtractedLabel(sourceAnalysisConfidence: number | undefined): AiExtractedLabelMeta | undefined {
  if (sourceAnalysisConfidence === undefined) return undefined;
  return {
    confidence: sourceAnalysisConfidence,
    isUncertain: sourceAnalysisConfidence <= 0.6, // mevcut LOW_CONFIDENCE_THRESHOLD ile aynı eşik (growth-scoring.util.ts)
    extractedAt: new Date().toISOString(),
  };
}

export function toFertilizerCreationParams(request: ProductCreateRequest, inventoryItemId: string): Omit<Fertilizer, "id"> {
  return {
    inventoryItemId,
    npkRatio: request.npkRatio || undefined,
    organicContentPercent: request.organicContentPercent,
    microElements: request.microElements || undefined,
    isActive: true,
    aiExtractedLabel: buildAiExtractedLabel(request.sourceAnalysisConfidence),
    // userConfirmed daima true: bu route yalnızca kullanıcının "Kaydet"e
    // bastığı, açıkça onayladığı akışta çağrılır (bkz. Freeze §5,
    // "Kullanıcı Onayı").
    userConfirmed: true,
  };
}

export function toChemicalCreationParams(request: ProductCreateRequest, inventoryItemId: string): Omit<Chemical, "id"> {
  return {
    inventoryItemId,
    activeIngredient: (request.activeIngredient || "").trim(),
    concentration: request.concentration || undefined,
    targetPests: Array.isArray(request.targetPests) ? request.targetPests : [],
    preHarvestIntervalDays: request.preHarvestIntervalDays ?? 0,
    isActive: true,
    aiExtractedLabel: buildAiExtractedLabel(request.sourceAnalysisConfidence),
    userConfirmed: true,
  };
}
