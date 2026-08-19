import { NextRequest, NextResponse } from "next/server";
import { getHsnSummary } from "@/lib/actions/hsn-summary";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getHsnSummary(from, to);

  const csv = toCsv(rows, [
    { key: "hsnCode", label: "HSN code" },
    { key: "taxRate", label: "Tax rate (%)" },
    { key: "taxableValue", label: "Taxable value" },
    { key: "cgstAmount", label: "CGST" },
    { key: "sgstAmount", label: "SGST" },
    { key: "taxAmount", label: "Total tax" },
    { key: "totalValue", label: "Total value" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hsn-summary-${from}-to-${to}.csv"`,
    },
  });
}
