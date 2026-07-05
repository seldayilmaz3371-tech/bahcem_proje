/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import { getQueuedObservations, syncQueuedObservations } from "../offline/offlineQueue";

interface OfflineSyncState {
  /** Number of observations currently waiting in the local queue. */
  pendingCount: number;
  /** True while a sync attempt is actively in progress. */
  isSyncing: boolean;
  /** Re-reads the queue's current size — call after enqueueing a new item. */
  refreshPendingCount: () => Promise<void>;
}

/**
 * Bridges connectivity status (see useOnlineStatus, reused here rather
 * than re-implemented) with the offline observation queue: automatically
 * flushes pending observations to the real API the moment the browser
 * regains connectivity, and exposes the current pending count so the UI
 * can show the farmer how many field records are still waiting to be
 * sent.
 *
 * This hook only orchestrates *when* to sync; the actual sync mechanics
 * (which endpoints to call, in what order, how to handle a partial
 * failure) live in offlineQueue.ts, keeping this hook a thin coordinator
 * rather than a place where business logic accumulates.
 */
export function useOfflineSync(authToken: string | null): OfflineSyncState {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const wasOnlineRef = useRef(isOnline);

  const refreshPendingCount = useCallback(async () => {
    try {
      const items = await getQueuedObservations();
      setPendingCount(items.length);
    } catch (error) {
      console.error("Bekleyen kayıt sayısı okunamadı:", error);
    }
  }, []);

  // Read the queue once on mount, so a farmer who queued observations in
  // a previous offline session (then closed the app before reconnecting)
  // still sees an accurate pending count immediately.
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    const justCameOnline = isOnline && !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;

    if (!justCameOnline || !authToken) {
      return;
    }

    setIsSyncing(true);
    syncQueuedObservations(authToken)
      .then(({ succeeded, failed }) => {
        if (succeeded > 0 || failed > 0) {
          console.info(`Çevrimdışı senkronizasyon tamamlandı: ${succeeded} başarılı, ${failed} başarısız (kuyrukta kaldı).`);
        }
      })
      .catch((error) => {
        console.error("Çevrimdışı senkronizasyon sırasında beklenmeyen bir hata oluştu:", error);
      })
      .finally(() => {
        setIsSyncing(false);
        refreshPendingCount();
      });
  }, [isOnline, authToken, refreshPendingCount]);

  return { pendingCount, isSyncing, refreshPendingCount };
}
