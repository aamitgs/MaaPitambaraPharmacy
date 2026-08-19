import { NextRequest, NextResponse } from "next/server";
import { getGstr1B2cs } from "@/lib/actions/gstr-export";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getGstr1B2cs(from, to);

  const csv = toCsv(rows, [
    { key: "type", label: "Type" },
    { key: "placeOfSupply", label: "Place Of Supply" },
    { key: "taxRate", label: "Applicable % of Tax Rate" },
    { key: "taxRate", label: "Rate" },
    { key: "taxableValue", label: "Taxable Value" },
    { key: "cessAmount", label: "Cess Amount" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gstr1-b2cs-${from}-to-${to}.csv"`,
    },
  });
}
