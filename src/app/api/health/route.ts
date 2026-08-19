import { NextResponse } from "next/server";

// Deliberately unauthenticated and trivial — used by the POS screen's
// online-status check as a real request/response probe. navigator.onLine
// alone only reflects the network interface, not whether this app's
// server is actually reachable, so the offline banner needs this instead.
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
