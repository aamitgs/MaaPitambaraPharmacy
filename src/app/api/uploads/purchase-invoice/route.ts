import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError } from "@/lib/rbac";
import { saveAttachment, AttachmentUploadError } from "@/lib/attachment-storage";

export async function POST(request: NextRequest) {
  // Same roles that may create a GRN — the upload happens while entering
  // one, so anyone who can't receive goods has no reason to write files.
  // Translated to a 403 rather than letting it surface as a 500: the form
  // shows the message in a toast, and "Upload failed" explains nothing.
  let session;
  try {
    session = await requireRole(["owner", "pharmacist"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Only an Owner or Pharmacist can attach a supplier bill." },
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
    const path = await saveAttachment("purchaseInvoices", session.user.tenantId, file);
    return NextResponse.json({ path });
  } catch (e) {
    if (e instanceof AttachmentUploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
