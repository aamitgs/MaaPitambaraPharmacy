import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const session = await requireSession();
  const items = await prisma.item.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });

  const csv = toCsv(items, [
    { key: "name", label: "Item name" },
    { key: "genericName", label: "Generic name" },
    { key: "manufacturer", label: "Manufacturer" },
    { key: "composition", label: "Composition" },
    { key: "scheduleClass", label: "Schedule class" },
    { key: "hsnCode", label: "HSN code" },
    { key: (i) => Number(i.taxRate), label: "Tax rate (%)" },
    { key: "unit", label: "Unit" },
    { key: "packSize", label: "Pack size" },
    { key: "reorderLevel", label: "Reorder level" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="item-master-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
