import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { readAttachment } from "@/lib/attachment-storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> }
) {
  const session = await requireSession();
  const { segments } = await params;
  const relativePath = segments.join("/");

  // Authorize by cross-checking the path against an invoice this tenant
  // owns, rather than trusting a tenantId embedded in the URL — the same
  // tenant-scoping discipline used by every other server action here.
  const invoice = await prisma.salesInvoice.findFirst({
    where: { tenantId: session.user.tenantId, prescriptionImageUrl: relativePath },
    select: { id: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readAttachment("prescriptions", relativePath);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
