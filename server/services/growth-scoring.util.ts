/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PhotoAiAnalysis } from "../models";

/**
 * Confidence threshold (0-1) at or below which a photo's AI analysis is
 * flagged as uncertain (see CONFIDENCE principle: never present
 * low-certainty AI output as if it were established fact). This is the
 * single source of truth for that threshold — do not duplicate this
 * value elsewhere.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Growth Analysis Scoring & Comparison Utilities.
 *
 * Deliberately isolated from AIService: everything in this module is
 * pure, deterministic, and has zero dependency on the Gemini client or
 * any network I/O. Per this project's AI PHILOSOPHY, Gemini produces a
 * one-time structured analysis per photo (see PhotoAiAnalysis); any
 * further interpretation of that data — comparison, trend evaluation,
 * flagging uncertainty — is a business-rule concern that belongs here,
 * not inside the AI layer, and must remain testable without mocking any
 * external service.
 */

/**
 * Determines whether a photo's AI analysis should be treated as
 * inconclusive rather than acted upon, based on its reported confidence.
 * @param confidence Model-reported confidence, 0-1
 */
export function isUncertainAnalysis(confidence: number): boolean {
  return confidence <= LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Compares two structured photo analyses and produces a plain-language
 * summary of what changed between them, entirely from stored data — no
 * AI call involved. Returns null if either analysis is uncertain, since
 * comparing two unreliable data points would itself be unreliable.
 * @param earlier The earlier (chronologically first) photo's analysis
 * @param later The later (chronologically second) photo's analysis
 */
export function compareAnalyses(
  earlier: PhotoAiAnalysis,
  later: PhotoAiAnalysis
): { healthDelta: number | null; stageChanged: boolean; newDiseaseDetected: boolean } | null {
  if (earlier.isUncertain || later.isUncertain) {
    return null;
  }

  const healthDelta =
    earlier.healthScore !== null && later.healthScore !== null
      ? later.healthScore - earlier.healthScore
      : null;

  return {
    healthDelta,
    stageChanged: earlier.growthStage !== later.growthStage,
    newDiseaseDetected: !earlier.diseaseIndication && !!later.diseaseIndication,
  };
}
