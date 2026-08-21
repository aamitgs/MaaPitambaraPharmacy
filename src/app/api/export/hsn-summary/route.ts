import type { NextRequest } from "next/server";
import { getHsnSummary } from "@/lib/actions/hsn-summary";
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

  const rows = await getHsnSummary(from, to);

  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: "hsnCode", label: "HSN code" },
    { key: "taxRate", label: "Tax rate (%)" , type: "money" },
    { key: "taxableValue", label: "Taxable value" , type: "money" },
    { key: "cgstAmount", label: "CGST" , type: "money" },
    { key: "sgstAmount", label: "SGST" , type: "money" },
    { key: "taxAmount", label: "Total tax" , type: "money" },
    { key: "totalValue", label: "Total value" , type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: rows,
    columns,
    filename: `hsn-summary-${from}-to-${to}`,
  });
}
