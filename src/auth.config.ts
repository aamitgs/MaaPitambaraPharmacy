import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe config used by middleware. Must not import Prisma or bcrypt —
 * middleware runs on the Edge runtime and only needs to read the JWT.
 * The real Credentials provider (with DB access) lives in `src/auth.ts`.
 */
const PUBLIC_ASSETS = new Set([
  "/icon.png",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/logo-icon.png",
  "/logo-stacked.png",
  "/logo-horizontal.png",
  // The offline shell. Both must answer without a session: a service worker
  // is registered from a redirect-free URL or not at all, and the offline
  // fallback page is by definition shown when the session cannot be checked.
  // Neither reveals anything — sw.js is caching logic, offline.html is a
  // static "no connection" message.
  "/sw.js",
  "/offline.html",
]);

/**
 * `Number("")` is `0`, not `NaN` — so an env var that's set but blank
 * silently survives `?? 15` (which only catches null/undefined) and gives
 * every session cookie a zero-second lifetime. A browser correctly reads
 * that `Expires` as already past and deletes the cookie on arrival, so
 * sign-in looks like it succeeds server-side (session row written, JWT
 * signed) and then silently fails in the browser with no error to show.
 */
function readIdleTimeoutMinutes(): number {
  const raw = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

export const authConfig = {
  // Required behind any proxy we terminate TLS at: Auth.js only trusts the
  // incoming Host header automatically when it can detect a Vercel
  // deployment. Everywhere else — including `next start` in this repo's own
  // Docker image — auth silently 500s on every request without this, which
  // only shows up in production/standalone mode, never in `next dev`.
  // Harmless on a cloud host, where it is already the effective default. The
  // operator is expected to terminate TLS and set NEXTAUTH_URL correctly
  // in front of this (see README).
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Idle-timeout approximation: the cookie's lifetime is the idle window,
    // and it's re-issued (sliding) whenever `updateAge` has elapsed since
    // the last request that touched the session.
    maxAge: readIdleTimeoutMinutes() * 60,
    updateAge: 60,
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const pathname = request.nextUrl.pathname;

      const isPublic =
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth") ||
        // Uploaded brand logos. Same reasoning as the bundled assets below,
        // but they cannot be listed by name — the filename is a UUID that
        // changes on every upload. Nothing confidential is served from this
        // route; see src/app/api/brand/[file]/route.ts.
        pathname.startsWith("/api/brand/") ||
        // The liveness probe. Genuinely public, which is the whole point:
        // an uptime monitor has no session, and until this was listed here
        // it was answered with a redirect to /login — so the monitor saw a
        // healthy 200 from the login page whatever state the app was in.
        // It reveals only whether the database answered, and how quickly.
        pathname === "/api/health" ||
        // The customer's own copy of their bill, reached by an unguessable
        // 128-bit token sent to them over SMS/WhatsApp. The recipient has
        // no account, so this cannot sit behind the session; the token is
        // the credential, and the page shows one invoice and nothing else.
        pathname.startsWith("/bill/") ||
        // Brand assets referenced from the <head> of the login page itself
        // (Next's icon file convention and the PWA manifest). Without this
        // they 307 to /login, so a signed-out tab shows no favicon and the
        // manifest never loads.
        PUBLIC_ASSETS.has(pathname);
      if (isPublic) return true;
      if (!isLoggedIn) return false;

      const mfaSetupRequired = auth.user.mfaSetupRequired;
      const onMfaSetup = pathname.startsWith("/mfa-setup");
      if (mfaSetupRequired && !onMfaSetup) {
        return Response.redirect(new URL("/mfa-setup", request.nextUrl));
      }
      if (!mfaSetupRequired && onMfaSetup) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
    // Pure (no DB/bcrypt) so it's safe to run on the Edge in middleware too.
    // Copies the custom JWT claims set in src/auth.ts's `jwt` callback onto
    // `session.user` — without this, middleware can't see role/tenantId/
    // mfaSetupRequired and the `authorized` callback above would misfire.
    async session({ session, token }) {
      session.sid = (token.sid as string | null | undefined) ?? null;
      session.user.id = token.id as string;
      session.user.tenantId = token.tenantId as string;
      session.user.role = token.role;
      session.user.mfaSetupRequired = token.mfaSetupRequired as boolean;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
