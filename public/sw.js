/*
 * Offline shell for the counter.
 *
 * The POS already keeps everything it needs to ring up a sale in IndexedDB,
 * and queues sales it cannot post. None of that helps if the page itself
 * will not load: without a service worker an outage only survives while the
 * tab stays open and untouched, and a reload — or a staff member opening the
 * till fresh — gets the browser's error page instead. Every route in this app
 * is server-rendered, so there is nothing to fall back on by default.
 *
 * Deliberately runtime caching rather than a build-time precache manifest:
 * asset names are content-hashed by the build, and a till loads the same few
 * screens every day, so warming the cache by using the app is both simpler
 * and sufficient. The cost is that a brand-new device must load the POS once
 * while online before it can survive an outage.
 */

// Bumping this drops every cache on the next activate. Do it whenever the
// shell's shape changes, so a till cannot keep serving HTML that references
// build assets a deploy has since replaced.
const VERSION = "v2";
const STATIC_CACHE = `mpp-static-${VERSION}`;
const SHELL_CACHE = `mpp-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

/** Pages worth keeping a copy of. Billing is the one that cannot wait. */
const SHELL_PATHS = ["/pos"];

/** Bundled artwork, safe to serve from cache indefinitely. */
const PRECACHE = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/logo-horizontal.png",
  "/logo-icon.png",
  "/logo-stacked.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Individually, so one missing file cannot fail the whole install and
      // leave the till with no service worker at all.
      await Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => undefined))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, SHELL_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.map((n) => (n.startsWith("mpp-") && !keep.has(n) ? caches.delete(n) : undefined))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Signing out clears the cached pages. The HTML of a POS screen carries the
 * catalogue and the customer list, and while the device already holds that in
 * IndexedDB, there is no reason to keep serving it to whoever opens the till
 * next.
 */
self.addEventListener("message", (event) => {
  if (event.data === "clear-shell") {
    event.waitUntil(caches.delete(SHELL_CACHE));
  }
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  PRECACHE.includes(url.pathname) ||
  url.pathname.startsWith("/api/brand/");

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * Everything that is not the till. These pages need the server, so there is
 * nothing useful to cache — but an outage should still explain itself rather
 * than handing staff the browser's error page.
 */
async function networkOrOfflinePage(request) {
  try {
    return await fetch(request);
  } catch {
    const fallback = await caches.open(STATIC_CACHE).then((c) => c.match(OFFLINE_URL));
    return fallback ?? Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    // Only a real page is worth keeping. A redirect to /login is what an
    // expired session looks like, and caching it would strand the till on
    // the login screen for the whole outage.
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const fallback = await caches.open(STATIC_CACHE).then((c) => c.match(OFFLINE_URL));
    return fallback ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Anything that changes state must reach the server or fail loudly, so the
  // POS can queue it. Never serve a sale from a cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Auth and data endpoints are always live. A cached session check is worse
  // than none at all.
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/brand/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      SHELL_PATHS.some((p) => url.pathname === p)
        ? networkFirst(request)
        : networkOrOfflinePage(request)
    );
  }
});
