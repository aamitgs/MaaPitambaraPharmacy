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
  const customers = await prisma.customer.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });

  const columns: ExportColumn<(typeof customers)[number]>[] = [
    { key: "name", label: "Customer name" },
    { key: "phone", label: "Phone" },
    { key: (c) => (c.creditLimit == null ? "" : Number(c.creditLimit)), label: "Credit limit", type: "money" },
    { key: "creditTermDays", label: "Credit term (days)", type: "number" },
    { key: (c) => Number(c.outstandingBalance), label: "Outstanding balance", type: "money" },
    { key: (c) => Number(c.cumulativeSpend), label: "Cumulative spend", type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: customers,
    columns,
    filename: `customers-${new Date().toISOString().slice(0, 10)}`,
  });
}
