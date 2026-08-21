import type { NextRequest } from "next/server";
import { getDiscountLines } from "@/lib/actions/discount-report";
import { defaultMonthRange } from "@/lib/date-range";
import {
  exportResponse,
  formatFromRequest,
  type ExportColumn,
} from "@/lib/export-response";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getDiscountLines(from, to);

  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: "date", label: "Date" },
    { key: "staffName", label: "Staff" },
    { key: (r) => r.itemName ?? "—", label: "Item" },
    { key: "type", label: "Discount type" , type: "money" },
    { key: "amount", label: "Amount (₹)" , type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: rows,
    columns,
    filename: `discount-report-${from}-to-${to}`,
  });
}
