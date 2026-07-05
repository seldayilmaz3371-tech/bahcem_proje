/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";

/**
 * Tracks the browser's online/offline status using the native
 * `navigator.onLine` API and the `online`/`offline` window events.
 *
 * This is deliberately a detection-only mechanism, not a full offline
 * data layer. This application currently has no local cache, write
 * queue, or conflict-resolution strategy — every screen depends on a
 * live `fetch()` call succeeding. Attempting to queue writes for later
 * sync without also solving conflict resolution (e.g. two devices
 * editing the same parcel while offline) would risk silent data loss or
 * corruption, which this project's "doğruluk yaratıcılıktan daha
 * önemlidir" principle does not allow to be rushed.
 *
 * What this hook DOES provide, safely and immediately: honest,
 * real-time feedback to the user the moment connectivity is lost, so a
 * failed save is understood as "you're offline" rather than a confusing
 * silent failure. This is Faz 1 of a larger, separately-planned offline
 * support initiative (see project documentation) — true read/write
 * offline capability (local persistence + sync queue + conflict
 * handling) is a distinct, larger undertaking, not attempted here.
 *
 * @returns true if the browser currently reports an active network connection
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
