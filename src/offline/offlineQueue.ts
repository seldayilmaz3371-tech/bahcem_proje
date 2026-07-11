/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Data needed to recreate a field observation (and optionally its
 * attached photo) once connectivity returns. Mirrors exactly what
 * POST /api/observations and POST /api/observations/upload-photo already
 * accept — this queue never introduces a new API shape, it only delays
 * calling the existing endpoints.
 */
export interface QueuedObservationPayload {
  parcelId: string;
  treeId?: string;
  activityType?: string;
  observationDate?: string;
  notes: string;
}

/** A single pending, not-yet-synced observation, as stored in IndexedDB. */
export interface QueuedObservation {
  /** Client-generated identifier, used as the IndexedDB key and to prevent double-submission. */
  queueId: string;
  queuedAt: string;
  payload: QueuedObservationPayload;
  /** Full base64 data URLs of every attached photo, if any (an observation may have zero, one, or several). */
  photoBase64s?: string[];
}

/** Result of attempting to flush the queue against the real API. */
export interface SyncResult {
  succeeded: number;
  failed: number;
}

const DB_NAME = "agritech_offline_queue";
const DB_VERSION = 1;
const STORE_NAME = "pending_observations";

/**
 * Maximum number of observations that may be queued while offline. This
 * is a deliberate, honest limit: unbounded queuing risks the browser's
 * storage quota being exceeded (photos are the dominant size — and each
 * queued observation may now hold several, not just one), which would
 * surface as an unpredictable IndexedDB failure rather than a clear,
 * anticipated message to the farmer. 30 was chosen as generous for a
 * single day's fieldwork while keeping worst-case storage bounded.
 */
export const MAX_QUEUED_OBSERVATIONS = 30;

/**
 * Offline Observation Queue.
 *
 * This module is the one genuinely new piece of infrastructure required
 * for offline field-data capture: no existing structure in this project
 * persists data in the browser or replays deferred API calls. Scope is
 * deliberately narrow — it only queues NEW observation creation (with an
 * optional photo), never edits to existing records. Editing an existing
 * record while offline would risk a conflicting write once another
 * device or session modifies the same record before sync — a
 * conflict-resolution problem this project has not designed for. Queuing
 * only brand-new records has no such risk: a new record can never
 * conflict with anything that already exists.
 *
 * Both ObservationLog (full field-observation form) and ParcelManager's
 * quick reference-tree photo shortcut use this same queue, since both
 * ultimately perform the identical two-step operation this queue
 * replays: create an observation, then optionally attach a photo to it.
 */

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "queueId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Adds a new observation to the offline queue.
 * @throws Error if the queue is already at MAX_QUEUED_OBSERVATIONS capacity
 */
export async function enqueueObservation(item: QueuedObservation): Promise<void> {
  const existing = await getQueuedObservations();
  if (existing.length >= MAX_QUEUED_OBSERVATIONS) {
    throw new Error(
      `Çevrimdışı kuyruk dolu (en fazla ${MAX_QUEUED_OBSERVATIONS} kayıt). Lütfen internet bağlantısı sağlayıp bekleyen kayıtların gönderilmesini bekleyin.`
    );
  }

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Returns every observation currently waiting to be synced, oldest first. */
export async function getQueuedObservations(): Promise<QueuedObservation[]> {
  const db = await openDatabase();
  const items = await new Promise<QueuedObservation[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as QueuedObservation[]);
    request.onerror = () => reject(request.error);
  });
  db.close();

  return items.sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime());
}

/** Removes a successfully synced observation from the queue. */
async function removeQueuedObservation(queueId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(queueId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Attempts to submit every queued observation to the real API, in the
 * order they were created. Reuses the exact same endpoints a normal,
 * online submission would call — no separate "sync" API exists or is
 * needed. An item that fails to sync (e.g. connectivity dropped again
 * mid-sync) is left in the queue for the next attempt rather than lost;
 * only successfully synced items are removed.
 * @param authToken Current session token, for the Authorization header
 */
export async function syncQueuedObservations(authToken: string): Promise<SyncResult> {
  const pending = await getQueuedObservations();
  let succeeded = 0;
  let failed = 0;

  const headers = {
    "Authorization": `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };

  for (const item of pending) {
    try {
      const obsRes = await fetch("/api/observations", {
        method: "POST",
        headers,
        body: JSON.stringify(item.payload),
      });
      const obsData = await obsRes.json();
      if (!obsRes.ok) {
        throw new Error(obsData.error || "Gözlem kaydedilemedi.");
      }

      if (item.photoBase64s && item.photoBase64s.length > 0) {
        for (const photoBase64 of item.photoBase64s) {
          await fetch("/api/observations/upload-photo", {
            method: "POST",
            headers,
            body: JSON.stringify({
              observationId: obsData.id,
              base64Data: photoBase64,
              takenAt: item.payload.observationDate,
            }),
          });
        }
      }

      await removeQueuedObservation(item.queueId);
      succeeded++;
    } catch (error) {
      // Left in the queue intentionally — will be retried on the next
      // sync attempt. A single failed item must not block the others.
      console.error("Çevrimdışı kayıt senkronize edilemedi, kuyrukta bekletiliyor:", error);
      failed++;
    }
  }

  return { succeeded, failed };
}
