"use client";

import { useEffect } from "react";

/**
 * Registers the offline shell.
 *
 * Production only, on purpose: in development Turbopack serves modules that
 * change on every edit, and a cache sitting in front of them produces stale
 * bundles that look like impossible bugs.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A till that cannot register still bills perfectly well online;
        // it just loses the ability to survive a reload during an outage.
      });
    };

    // After load, so registration never competes with the first paint of
    // the POS screen.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
