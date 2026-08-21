import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { canViewPurchaseRate } from "@/lib/rbac";
import {
  exportResponse,
  formatFromRequest,
  type ExportColumn,
} from "@/lib/export-response";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const session = await requireSession();
  const batches = await prisma.batch.findMany({
    where: { item: { tenantId: session.user.tenantId } },
    include: { item: true },
    orderBy: [{ item: { name: "asc" } }, { expiryDate: "asc" }],
  });

  const showPurchaseRate = canViewPurchaseRate(session.user.role);

  const columns: ExportColumn<(typeof batches)[number]>[] = [
    { key: (b) => b.item.name, label: "Item name" },
    { key: "batchNo", label: "Batch no." },
    { key: "mfgDate", label: "Mfg date" },
    { key: "expiryDate", label: "Expiry date" },
    { key: (b) => Number(b.mrp), label: "MRP" , type: "money" },
    ...(showPurchaseRate
      ? [{ key: (b: (typeof batches)[number]) => Number(b.purchaseRate), label: "Purchase rate" }]
      : []),
    { key: (b) => Number(b.saleRate), label: "Sale rate" , type: "money" },
    { key: "currentQty", label: "Current qty" , type: "number" },
    { key: "looseUnits", label: "Loose units" , type: "number" },
    { key: "rackLocation", label: "Rack location" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: batches,
    columns,
    filename: `batch-stock-${new Date().toISOString().slice(0, 10)}`,
  });
}
