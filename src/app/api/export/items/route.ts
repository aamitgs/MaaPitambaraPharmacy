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
  const items = await prisma.item.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });

  const columns: ExportColumn<(typeof items)[number]>[] = [
    { key: "name", label: "Item name" },
    { key: "genericName", label: "Generic name" },
    { key: "manufacturer", label: "Manufacturer" },
    { key: "composition", label: "Composition" },
    { key: "scheduleClass", label: "Schedule class" },
    { key: "hsnCode", label: "HSN code" },
    { key: (i) => Number(i.taxRate), label: "Tax rate (%)" , type: "money" },
    { key: "unit", label: "Unit" },
    { key: "packSize", label: "Pack size" },
    { key: "barcode", label: "Barcode" },
    { key: "unitsPerPack", label: "Units per pack", type: "number" },
    { key: (i) => (i.allowLooseSale ? "yes" : "no"), label: "Allow loose sale" },
    { key: (i) => (i.isActive ? "yes" : "no"), label: "Active" },
    { key: "reorderLevel", label: "Reorder level" , type: "number" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: items,
    columns,
    filename: `item-master-${new Date().toISOString().slice(0, 10)}`,
  });
}
