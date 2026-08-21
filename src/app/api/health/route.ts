import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Unauthenticated liveness probe, used by the POS screen's online check
 * and by anything watching the server from outside.
 *
 * It runs a real query. A bare {ok:true} only proves Next.js is serving
 * requests, which is exactly the state a pharmacy is in when the database
 * has gone away and every sale is about to fail — the POS would show
 * "online", staff would keep billing, and each bill would error one at a
 * time instead of dropping cleanly into the offline queue.
 *
 * Deliberately says nothing about versions, table counts or connection
 * strings: it is reachable without a session.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, db: "up", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // 503, not 200-with-a-flag: a load balancer or uptime monitor should
    // be able to act on this without parsing the body. The error itself is
    // not echoed back — it can carry connection details.
    return NextResponse.json(
      { ok: false, db: "down", latencyMs: Date.now() - startedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
