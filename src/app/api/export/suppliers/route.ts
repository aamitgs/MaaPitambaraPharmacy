import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import {
  exportResponse,
  formatFromRequest,
  type ExportColumn,
} from "@/lib/export-response";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const session = await requireSession();
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });

  const columns: ExportColumn<(typeof suppliers)[number]>[] = [
    { key: "name", label: "Supplier name" },
    { key: "phone", label: "Phone" },
    { key: "gstin", label: "GSTIN" },
    { key: "address", label: "Address" },
    { key: "paymentTermsDays", label: "Payment terms (days)", type: "number" },
    { key: (s) => Number(s.outstandingBalance), label: "Outstanding balance", type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: suppliers,
    columns,
    filename: `suppliers-${new Date().toISOString().slice(0, 10)}`,
  });
}
