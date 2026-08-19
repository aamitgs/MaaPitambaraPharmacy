import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rbac";
import { saveAttachment, AttachmentUploadError } from "@/lib/attachment-storage";

export async function POST(request: NextRequest) {
  const session = await requireSession();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const path = await saveAttachment("prescriptions", session.user.tenantId, file);
    return NextResponse.json({ path });
  } catch (e) {
    if (e instanceof AttachmentUploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
