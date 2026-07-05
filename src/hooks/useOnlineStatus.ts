/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";

/** How often to re-verify genuine connectivity while the browser reports itself online. */
const CONNECTIVITY_CHECK_INTERVAL_MS = 20000;

/** Maximum time to wait for the health check before treating it as a failure. */
const CONNECTIVITY_CHECK_TIMEOUT_MS = 5000;

/**
 * Verifies genuine reachability of this application's own server via its
 * minimal `/api/health` endpoint (see server.ts) — deliberately not a
 * third-party URL, since the goal is "can this app actually be used
 * right now", not general internet access.
 * @returns true if the server responded successfully within the timeout
 */
async function checkRealConnectivity(): Promise<boolean> {
  try {
    const response = await fetch("/api/health", {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(CONNECTIVITY_CHECK_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Tracks whether this application can genuinely reach its own server —
 * not merely whether the browser's network interface is active.
 *
 * `navigator.onLine` and the `online`/`offline` window events are a
 * known false-positive source: they report true whenever a network
 * interface (WiFi, mobile data) is connected, regardless of whether that
 * network can actually reach anything. In the field, a weak or flaky
 * mobile signal commonly triggers exactly this: the browser reports
 * "online" while requests silently fail or time out. This was observed
 * directly — Chrome's own native offline-cache indicator appeared while
 * this hook (relying on the browser events alone) still reported online.
 *
 * This hook therefore treats the browser events as a fast, cheap first
 * signal, but confirms genuine reachability with a lightweight periodic
 * health check (see checkRealConnectivity) before ever reporting "online"
 * as true. Going offline is trusted immediately from the browser event
 * alone — a dropped network interface is a reliable signal in that
 * direction; it is specifically the "online" claim that needs
 * verification.
 *
 * This remains detection-only: it reports connectivity status for the
 * UI (offline banner, pending-sync indicator) and to trigger
 * useOfflineSync's automatic queue flush. The actual offline data
 * capture and sync logic lives in src/offline/offlineQueue.ts and
 * src/hooks/useOfflineSync.ts, which consume this hook's result rather
 * than duplicating connectivity detection.
 *
 * @returns true only when the server has been confirmed genuinely reachable
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const verifyAndSetStatus = async () => {
      if (!navigator.onLine) {
        // Trusted immediately — no network interface means no point
        // spending a request confirming what is already known.
        if (isMountedRef.current) setIsOnline(false);
        return;
      }

      const reallyOnline = await checkRealConnectivity();
      if (isMountedRef.current) setIsOnline(reallyOnline);
    };

    // Verify once immediately (covers the case where the hook mounts
    // while already on a flaky connection) and again on every browser
    // online/offline transition.
    verifyAndSetStatus();
    window.addEventListener("online", verifyAndSetStatus);
    window.addEventListener("offline", verifyAndSetStatus);

    // Periodically re-verify while the browser claims to be online, to
    // catch a connection degrading without the browser ever firing an
    // "offline" event — the exact scenario this hook exists to correct.
    const intervalId = setInterval(() => {
      if (navigator.onLine) {
        verifyAndSetStatus();
      }
    }, CONNECTIVITY_CHECK_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("online", verifyAndSetStatus);
      window.removeEventListener("offline", verifyAndSetStatus);
      clearInterval(intervalId);
    };
  }, []);

  return isOnline;
}
