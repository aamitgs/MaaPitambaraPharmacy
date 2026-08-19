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

  // Authorize by cross-checking the path against an item this tenant owns,
  // rather than trusting a tenantId embedded in the URL.
  const item = await prisma.item.findFirst({
    where: { tenantId: session.user.tenantId, imageUrl: relativePath },
    select: { id: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readAttachment("itemPhotos", relativePath);
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
