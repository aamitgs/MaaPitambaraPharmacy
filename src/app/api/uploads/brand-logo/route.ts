import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError } from "@/lib/rbac";
import { saveAttachment, AttachmentUploadError } from "@/lib/attachment-storage";

/**
 * Owner-only, and hard-gated to the role rather than to a permission: the
 * logo on a bill is the pharmacy's identity to a customer or an inspector,
 * so it is not something a custom role can be granted.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(["owner"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Only the owner can change the logo." },
        { status: 403 }
      );
    }
    throw e;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  // A PDF would upload happily through saveAttachment and then fail to
  // render everywhere it is used, so it is refused here rather than later.
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "A logo must be a PNG, JPEG or WEBP image." },
      { status: 400 }
    );
  }

  try {
    // Stored per-tenant like every other attachment, but read back without
    // a tenant check — see the serving route.
    const path = await saveAttachment("brandAssets", "brand", file);
    return NextResponse.json({ path });
  } catch (e) {
    if (e instanceof AttachmentUploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
