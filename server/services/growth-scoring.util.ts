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

// ==========================================================================
// PARCEL-LEVEL AGGREGATION FROM REFERENCE TREES
//
// Large parcels can have hundreds of trees; analyzing every single one
// with Gemini is neither practical nor a sound use of AI quota. Instead,
// a small farmer-chosen set of "Referans Ağaç" (reference tree) records
// receives closer photo-based monitoring, and the parcel's overall
// condition is inferred from just these trees' latest analyses — a
// purely deterministic aggregation, entirely consistent with this
// project's AI PHILOSOPHY (Gemini analyzes; it never makes the final
// call, and it is never re-invoked just to summarize data it already
// produced).
// ==========================================================================

/** A health score at or below this value marks a tree as "at risk" even without an explicit disease indication. */
const AT_RISK_HEALTH_SCORE_THRESHOLD = 60;

/** A single reference tree's identity paired with its latest known analysis (if any). */
export interface ReferenceTreeStatus {
  treeId: string;
  treeNumber: string;
  latestAnalysis: PhotoAiAnalysis | null;
}

/** Deterministic, parcel-wide health summary computed from its reference trees. */
export interface ParcelHealthSummary {
  referenceTreeCount: number;
  /** How many reference trees have at least one analyzed photo. */
  analyzedTreeCount: number;
  healthyCount: number;
  atRiskCount: number;
  uncertainCount: number;
  averageHealthScore: number | null;
  overallStatus: "Sağlıklı" | "Riskli Bölgeler Var" | "Belirsiz" | "Veri Yok";
  treeStatuses: ReferenceTreeStatus[];
}

/**
 * Classifies a single reference tree's latest analysis into one of
 * "healthy", "at risk", or "uncertain" — never guessing when the
 * underlying analysis itself was flagged uncertain (see CONFIDENCE
 * principle).
 */
function classifyTreeStatus(analysis: PhotoAiAnalysis): "healthy" | "atRisk" | "uncertain" {
  if (analysis.isUncertain) {
    return "uncertain";
  }
  const hasDisease = !!analysis.diseaseIndication;
  const hasLowHealthScore = analysis.healthScore !== null && analysis.healthScore <= AT_RISK_HEALTH_SCORE_THRESHOLD;
  return hasDisease || hasLowHealthScore ? "atRisk" : "healthy";
}

/**
 * Aggregates a parcel's reference trees into a single deterministic
 * health summary. Never calls Gemini — this is pure computation over
 * data Gemini already produced once per tree (see
 * PhotoRepository.getLatestAnalyzedPhotoByTreeId).
 * @param treeStatuses Each reference tree's identity and latest analysis
 */
export function summarizeParcelHealthFromReferenceTrees(treeStatuses: ReferenceTreeStatus[]): ParcelHealthSummary {
  const referenceTreeCount = treeStatuses.length;
  const analyzedStatuses = treeStatuses.filter((status) => status.latestAnalysis !== null);
  const analyzedTreeCount = analyzedStatuses.length;

  if (referenceTreeCount === 0 || analyzedTreeCount === 0) {
    return {
      referenceTreeCount,
      analyzedTreeCount: 0,
      healthyCount: 0,
      atRiskCount: 0,
      uncertainCount: 0,
      averageHealthScore: null,
      overallStatus: "Veri Yok",
      treeStatuses,
    };
  }

  let healthyCount = 0;
  let atRiskCount = 0;
  let uncertainCount = 0;
  const healthScores: number[] = [];

  for (const status of analyzedStatuses) {
    const analysis = status.latestAnalysis!;
    const classification = classifyTreeStatus(analysis);

    if (classification === "uncertain") {
      uncertainCount++;
    } else if (classification === "atRisk") {
      atRiskCount++;
    } else {
      healthyCount++;
    }

    if (analysis.healthScore !== null) {
      healthScores.push(analysis.healthScore);
    }
  }

  const averageHealthScore = healthScores.length > 0
    ? Math.round(healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length)
    : null;

  const overallStatus = determineOverallStatus(atRiskCount, healthyCount, uncertainCount);

  return {
    referenceTreeCount,
    analyzedTreeCount,
    healthyCount,
    atRiskCount,
    uncertainCount,
    averageHealthScore,
    overallStatus,
    treeStatuses,
  };
}

/**
 * Determines the parcel's overall status label from its reference
 * trees' classifications. Any at-risk tree takes priority over an
 * otherwise healthy majority, since a single diseased/at-risk tree is
 * actionable information a farmer should not have averaged away.
 */
function determineOverallStatus(
  atRiskCount: number,
  healthyCount: number,
  uncertainCount: number
): ParcelHealthSummary["overallStatus"] {
  if (atRiskCount > 0) {
    return "Riskli Bölgeler Var";
  }
  if (healthyCount === 0 && uncertainCount > 0) {
    return "Belirsiz";
  }
  return "Sağlıklı";
}
