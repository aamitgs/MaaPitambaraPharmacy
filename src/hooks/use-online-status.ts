"use client";

import { useEffect, useRef, useState } from "react";

const PING_INTERVAL_MS = 15000;
const PING_TIMEOUT_MS = 4000;

/**
 * navigator.onLine only reflects the network interface being up, not
 * whether this app's own server is actually reachable (Wi-Fi connected to
 * a router with no internet still reports "online"). A real ping-and-time
 * out is the only reliable signal for "can the POS screen talk to the
 * server right now."
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
        const res = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
        clearTimeout(timeout);
        if (!cancelled) setIsOnline(res.ok);
      } catch {
        if (!cancelled) setIsOnline(false);
      } finally {
        inFlight.current = false;
      }
    }

    function handleOffline() {
      setIsOnline(false);
    }
    function handleOnline() {
      void ping();
    }

    void ping();
    const interval = setInterval(ping, PING_INTERVAL_MS);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return isOnline;
}
