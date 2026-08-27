import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export const { GET } = handlers;

/**
 * A sign-in response carries two Set-Cookie headers (callback-url and the
 * session token). When Vercel's edge brotli-compresses this response, the
 * session token cookie is silently lost while the first cookie survives —
 * reproducible on demand with `curl -H "Accept-Encoding: br" --compressed`,
 * not with gzip or no compression at all. So it's specifically the brotli
 * step, not this app's cookie logic (session creation, JWT signing, and the
 * DB round-trip after are all fine on their own). `Cache-Control:
 * no-transform` does not stop Vercel from compressing it regardless.
 * Declaring `Content-Encoding: identity` — this response is already in its
 * final form — does: a compressing proxy that finds an existing
 * Content-Encoding is expected to leave the body alone rather than
 * compress on top of it.
 */
export async function POST(req: NextRequest) {
  const res = await handlers.POST(req);
  res.headers.set("content-encoding", "identity");
  return res;
}
