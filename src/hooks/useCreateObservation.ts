/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { enqueueObservation, QueuedObservationPayload } from "../offline/offlineQueue";

export interface CreateObservationResult {
  /** True if the request could not reach the server at all and was queued locally instead of being submitted. */
  queued: boolean;
  observationId?: string;
}

/**
 * Creates a field observation, optionally with an attached photo, via the
 * existing POST /api/observations and POST /api/observations/upload-photo
 * endpoints — with automatic offline queueing on a genuine network
 * failure (see offlineQueue.ts).
 *
 * This exact sequence (create observation → optionally attach photo →
 * fall back to the offline queue on network failure) was independently
 * implemented in both ObservationLog.tsx and ParcelManager's tree quick-
 * photo shortcut before this hook existed. Extracted here per this
 * project's "Hook tekrarını önle" rule, so a third near-identical copy
 * was not written for the Dashboard's quick-observation shortcut.
 *
 * Only orchestrates the two existing API calls and the offline queue —
 * it introduces no new endpoint and no new business rule.
 */
export function useCreateObservation() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /**
   * @param payload Observation fields (matches POST /api/observations' body shape)
   * @param photoBase64s Optional full base64 data URLs of every attached photo (zero, one, or several)
   * @param photoOptions Optional overrides applied to EVERY photo in this call — `takenAt` backdates the photos (e.g. to match a retroactively logged observation's date), `label` tags their origin for display purposes, and `analyzeNow` opts into immediate AI analysis for a reference-tree photo (defaults to false — see server.ts's upload-photo route for why this must be explicit rather than automatic)
   */
  const createObservation = async (
    payload: QueuedObservationPayload,
    photoBase64s?: string[],
    photoOptions?: { takenAt?: string; label?: string; analyzeNow?: boolean }
  ): Promise<CreateObservationResult> => {
    setSaving(true);
    setError("");

    try {
      const headers = {
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      let obsRes: Response;
      try {
        obsRes = await fetch("/api/observations", {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });
      } catch {
        // Genuine network failure — queued locally for automatic
        // submission once connectivity returns (see useOfflineSync).
        await enqueueObservation({
          queueId: crypto.randomUUID(),
          queuedAt: new Date().toISOString(),
          payload,
          photoBase64s,
        });
        return { queued: true };
      }

      const obsData = await obsRes.json();
      if (!obsRes.ok) {
        throw new Error(obsData.error || "Gözlem kaydedilemedi.");
      }

      // Uploaded sequentially (not in parallel) so a slow field
      // connection doesn't fire several large base64 uploads at once —
      // each photo is a fully independent call to the existing
      // single-photo endpoint, matching how this observation's photos
      // are stored (see Photo.observationId, a one-to-many relation
      // already supported by the data layer with no schema change).
      if (photoBase64s && photoBase64s.length > 0) {
        for (const photoBase64 of photoBase64s) {
          const photoRes = await fetch("/api/observations/upload-photo", {
            method: "POST",
            headers,
            body: JSON.stringify({
              observationId: obsData.id,
              base64Data: photoBase64,
              takenAt: photoOptions?.takenAt,
              label: photoOptions?.label,
              analyzeNow: photoOptions?.analyzeNow || false,
            })
          });
          if (!photoRes.ok) {
            const photoData = await photoRes.json();
            throw new Error(photoData.error || "Fotoğraf yüklenemedi.");
          }
        }
      }

      return { queued: false, observationId: obsData.id };
    } catch (err: any) {
      setError(err.message || "Gözlem eklenirken bir hata oluştu.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return { createObservation, saving, error, setError };
}
