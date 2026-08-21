import { NextResponse } from "next/server";
import { requireSession } from "@/lib/rbac";
import { getInvoiceForReceipt } from "@/lib/actions/invoices";
import { invoiceFileName, renderInvoicePdf } from "@/lib/pdf/render-invoice";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  // getInvoiceForReceipt is already tenant-scoped, so a bill from another
  // pharmacy comes back null rather than rendering.
  const data = await getInvoiceForReceipt(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdf = await renderInvoicePdf(data);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceFileName(data.invoiceNo)}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
