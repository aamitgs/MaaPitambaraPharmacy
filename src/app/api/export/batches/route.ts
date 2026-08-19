import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { canViewPurchaseRate } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const session = await requireSession();
  const batches = await prisma.batch.findMany({
    where: { item: { tenantId: session.user.tenantId } },
    include: { item: true },
    orderBy: [{ item: { name: "asc" } }, { expiryDate: "asc" }],
  });

  const showPurchaseRate = canViewPurchaseRate(session.user.role);

  const csv = toCsv(batches, [
    { key: (b) => b.item.name, label: "Item name" },
    { key: "batchNo", label: "Batch no." },
    { key: "mfgDate", label: "Mfg date" },
    { key: "expiryDate", label: "Expiry date" },
    { key: (b) => Number(b.mrp), label: "MRP" },
    ...(showPurchaseRate
      ? [{ key: (b: (typeof batches)[number]) => Number(b.purchaseRate), label: "Purchase rate" }]
      : []),
    { key: (b) => Number(b.saleRate), label: "Sale rate" },
    { key: "currentQty", label: "Current qty" },
    { key: "rackLocation", label: "Rack location" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="batch-stock-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
