import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const session = await requireSession();
  const invoices = await prisma.salesInvoice.findMany({
    where: { tenantId: session.user.tenantId },
    include: { customer: true },
    orderBy: { invoiceDate: "desc" },
  });

  const csv = toCsv(invoices, [
    { key: "invoiceNo", label: "Invoice no." },
    { key: "invoiceDate", label: "Date" },
    { key: (i) => i.customer?.name ?? "Walk-in", label: "Customer" },
    { key: "paymentMode", label: "Payment mode" },
    { key: "status", label: "Status" },
    { key: (i) => Number(i.subtotal), label: "Subtotal" },
    { key: (i) => Number(i.discountAmount), label: "Discount" },
    { key: (i) => Number(i.taxAmount), label: "Tax" },
    { key: (i) => Number(i.total), label: "Total" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-register-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
