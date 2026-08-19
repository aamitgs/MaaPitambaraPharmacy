import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError } from "@/lib/rbac";
import { saveAttachment, AttachmentUploadError } from "@/lib/attachment-storage";

export async function POST(request: NextRequest) {
  // Same roles that may edit the item master.
  let session;
  try {
    session = await requireRole(["owner", "pharmacist"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Only an Owner or Pharmacist can add an item photo." },
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

  try {
    const path = await saveAttachment("itemPhotos", session.user.tenantId, file);
    return NextResponse.json({ path });
  } catch (e) {
    if (e instanceof AttachmentUploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
