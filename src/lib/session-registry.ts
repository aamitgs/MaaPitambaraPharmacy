import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The record that makes a stateless session endable.
 *
 * A JWT session cannot be revoked — that is the trade it makes for not
 * hitting the database on every request. So the token carries the id of a
 * row here, and the row is what says whether the session is still good. A
 * phone left on a bus, or a counter PC someone walked away from, can then
 * actually be cut off instead of being waited out.
 */

/// How stale `lastSeenAt` may get before it is written again. Every
/// request touching the session would be a write per page view; a minute
/// is precise enough to tell a live session from an abandoned one.
const LAST_SEEN_THROTTLE_MS = 60_000;

/**
 * IP addresses are kept only as far as the network. Enough for someone to
 * tell their own shop from a session opened elsewhere, without keeping a
 * record of where staff are.
 */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const clean = ip.split(",")[0].trim();
  if (clean.includes(":")) {
    // IPv6 — keep the routing prefix only.
    return clean.split(":").slice(0, 3).join(":") + "::";
  }
  const parts = clean.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : null;
}

export async function createSession(params: {
  userId: string;
  tenantId: string;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<string | null> {
  try {
    const row = await prisma.userSession.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        userAgent: params.userAgent?.slice(0, 400) ?? null,
        ipPrefix: truncateIp(params.ip),
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    // Never block a sign-in because the registry write failed. A session
    // without a row behaves exactly as sessions did before this existed.
    return null;
  }
}

/**
 * Whether this session is still allowed, refreshing its last-seen stamp
 * as a side effect.
 *
 * Returns true for a token with no session id: tokens issued before this
 * shipped must keep working until they expire on their own, rather than
 * signing everyone out on deploy.
 */
export async function isSessionLive(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return true;
  try {
    const row = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, lastSeenAt: true },
    });
    if (!row) return false;
    if (row.revokedAt) return false;

    if (Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { lastSeenAt: new Date() },
      });
    }
    return true;
  } catch {
    // If the database is unreachable, a valid token is still a valid
    // token. Failing closed here would lock everyone out of the app the
    // moment Postgres hiccups, which is worse than a revocation taking a
    // few seconds longer to bite.
    return true;
  }
}
