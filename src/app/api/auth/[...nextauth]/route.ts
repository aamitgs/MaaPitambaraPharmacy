import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export const { GET } = handlers;

/**
 * A sign-in response carries two Set-Cookie headers (callback-url and the
 * session token). Vercel's edge compresses this response, and somewhere in
 * that path multiple Set-Cookie headers get flattened into one comma/newline
 * joined value — which no browser can parse back into two cookies, so the
 * session token is silently lost while the first cookie survives. `curl
 * --compressed` reproduces it too, uncompressed does not: it is the
 * compression step, not this app's cookie logic (session creation, JWT
 * signing, and the cookie the DB round-trip after are all fine on their own).
 * `no-transform` tells a compliant intermediary to leave the response alone.
 */
export async function POST(req: NextRequest) {
  const res = await handlers.POST(req);
  const cacheControl = res.headers.get("cache-control");
  res.headers.set("cache-control", cacheControl ? `${cacheControl}, no-transform` : "no-transform");
  return res;
}
