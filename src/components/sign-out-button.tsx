"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

/**
 * Signing out also drops the cached POS page. That HTML carries the
 * catalogue and the customer list, and while this device already holds the
 * same data in IndexedDB for offline billing, there is no reason to keep
 * serving a copy to whoever opens the till next.
 *
 * Best-effort and never blocking: a sign-out must complete even if the
 * service worker is missing, unregistered, or slow to answer.
 */
async function clearOfflineShell() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage("clear-shell");
  } catch {
    // Nothing to do — signing out matters more than the cache.
  }
}

export function SignOutButton({
  children,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      onClick={async () => {
        await clearOfflineShell();
        await signOut({ callbackUrl: "/login" });
      }}
    >
      {children ?? "Sign out"}
    </Button>
  );
}
