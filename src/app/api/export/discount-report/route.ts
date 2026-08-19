import { NextRequest, NextResponse } from "next/server";
import { getDiscountLines } from "@/lib/actions/discount-report";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getDiscountLines(from, to);

  const csv = toCsv(rows, [
    { key: "date", label: "Date" },
    { key: "staffName", label: "Staff" },
    { key: (r) => r.itemName ?? "—", label: "Item" },
    { key: "type", label: "Discount type" },
    { key: "amount", label: "Amount (₹)" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="discount-report-${from}-to-${to}.csv"`,
    },
  });
}
