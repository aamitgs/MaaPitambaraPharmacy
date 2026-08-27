"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Lets a page render its own actions into the app's single top bar instead
 * of growing a second header row of its own. Portals rather than prop
 * drilling, so a page deep in the tree can contribute without every layout
 * between here and there having to know about it.
 *
 * The host is read through an external store rather than set in an effect:
 * `getElementById` returns the same node every call, so the snapshot is
 * stable, and the null server snapshot keeps hydration clean.
 */
const subscribe = () => () => {};
const getHost = () => document.getElementById("topbar-actions");
const getServerHost = () => null;

export function TopBarPortal({ children }: { children: React.ReactNode }) {
  const host = useSyncExternalStore(subscribe, getHost, getServerHost);
  return host ? createPortal(children, host) : null;
}
