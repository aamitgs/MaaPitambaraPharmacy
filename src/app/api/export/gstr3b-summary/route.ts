import { NextRequest, NextResponse } from "next/server";
import { getGstr3bSummary } from "@/lib/actions/gstr-export";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getGstr3bSummary(from, to);

  const csv = toCsv(rows, [
    { key: "natureOfSupplies", label: "Nature of Supplies" },
    { key: "totalTaxableValue", label: "Total Taxable Value" },
    { key: "integratedTax", label: "Integrated Tax" },
    { key: "centralTax", label: "Central Tax" },
    { key: "stateTax", label: "State/UT Tax" },
    { key: "cess", label: "Cess" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gstr3b-summary-${from}-to-${to}.csv"`,
    },
  });
}
