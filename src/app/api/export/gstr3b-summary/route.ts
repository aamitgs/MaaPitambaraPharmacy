import type { NextRequest } from "next/server";
import { getGstr3bSummary } from "@/lib/actions/gstr-export";
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

  const rows = await getGstr3bSummary(from, to);

  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: "natureOfSupplies", label: "Nature of Supplies" },
    { key: "totalTaxableValue", label: "Total Taxable Value" , type: "money" },
    { key: "integratedTax", label: "Integrated Tax" },
    { key: "centralTax", label: "Central Tax" },
    { key: "stateTax", label: "State/UT Tax" },
    { key: "cess", label: "Cess" , type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: rows,
    columns,
    filename: `gstr3b-summary-${from}-to-${to}`,
  });
}
