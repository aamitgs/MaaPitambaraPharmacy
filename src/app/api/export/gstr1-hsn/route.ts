import { NextRequest, NextResponse } from "next/server";
import { getGstr1HsnSummary } from "@/lib/actions/gstr-export";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getGstr1HsnSummary(from, to);

  const csv = toCsv(rows, [
    { key: "hsnCode", label: "HSN" },
    { key: "description", label: "Description" },
    { key: "uqc", label: "UQC" },
    { key: "totalQuantity", label: "Total Quantity" },
    { key: "totalValue", label: "Total Value" },
    { key: "taxableValue", label: "Taxable Value" },
    { key: "integratedTaxAmount", label: "Integrated Tax Amount" },
    { key: "centralTaxAmount", label: "Central Tax Amount" },
    { key: "stateTaxAmount", label: "State/UT Tax Amount" },
    { key: "cessAmount", label: "Cess Amount" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gstr1-hsn-${from}-to-${to}.csv"`,
    },
  });
}
