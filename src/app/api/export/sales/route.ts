import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import {
  exportResponse,
  formatFromRequest,
  type ExportColumn,
} from "@/lib/export-response";
import { buildInvoiceWhere } from "@/lib/invoice-filter";
import { getBranchFilter } from "@/lib/branch-scope";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const p = request.nextUrl.searchParams;
  const searchParams = p;

  // Same filter the screen applied, so the file matches the table the
  // export button was sitting under.
  const where = buildInvoiceWhere(
    session.user.tenantId,
    {
      q: p.get("q") ?? undefined,
      medicine: p.get("medicine") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      paymentMode: p.get("paymentMode") ?? undefined,
      status: p.get("status") ?? undefined,
    },
    branchFilter
  );

  const invoices = await prisma.salesInvoice.findMany({
    where,
    include: { customer: true },
    orderBy: { invoiceDate: "desc" },
  });

  const columns: ExportColumn<(typeof invoices)[number]>[] = [
    { key: "invoiceNo", label: "Invoice no." },
    { key: "invoiceDate", label: "Date" },
    { key: (i) => i.customer?.name ?? "Walk-in", label: "Customer" },
    { key: "paymentMode", label: "Payment mode" },
    { key: "status", label: "Status" },
    { key: (i) => Number(i.subtotal), label: "Subtotal" , type: "money" },
    { key: (i) => Number(i.discountAmount), label: "Discount" , type: "money" },
    { key: (i) => Number(i.taxAmount), label: "Tax" , type: "money" },
    { key: (i) => Number(i.total), label: "Total" , type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: invoices,
    columns,
    filename: `sales-register-${new Date().toISOString().slice(0, 10)}`,
  });
}
