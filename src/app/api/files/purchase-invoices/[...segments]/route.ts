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

  // Authorize by cross-checking the path against a record this tenant owns,
  // rather than trusting a tenantId embedded in the URL — mirrors the
  // prescription route and the tenant-scoping used by every server action.
  // Any kind of purchase document may own the file: a GRN's supplier
  // invoice, a purchase order's quotation, or a supplier's card/cheque.
  const [grn, purchaseOrder, supplier] = await Promise.all([
    prisma.grn.findFirst({
      where: { tenantId: session.user.tenantId, invoiceImageUrl: relativePath },
      select: { id: true },
    }),
    prisma.purchaseOrder.findFirst({
      where: { tenantId: session.user.tenantId, documentImageUrl: relativePath },
      select: { id: true },
    }),
    prisma.supplier.findFirst({
      where: { tenantId: session.user.tenantId, documentImageUrl: relativePath },
      select: { id: true },
    }),
  ]);
  if (!grn && !purchaseOrder && !supplier) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readAttachment("purchaseInvoices", relativePath);
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
