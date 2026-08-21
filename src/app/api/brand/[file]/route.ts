import { NextResponse } from "next/server";
import { readAttachment } from "@/lib/attachment-storage";

/**
 * Public, deliberately. Unlike prescriptions or purchase invoices, a logo
 * has to render for people who are not signed in — the login screen, and
 * the recipient of an emailed bill. Filenames are random UUIDs, the route
 * only ever reads from the brand-assets root, and readAttachment refuses
 * to escape it.
 *
 * Immutable caching is safe because the filename changes on every upload;
 * getBranding() also appends a ?v= stamp so an intermediary that ignores
 * the filename still misses on a swap.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const found = await readAttachment("brandAssets", `brand/${file}`);
  if (!found) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
