import type { NextRequest } from "next/server";
import { getGstr1HsnSummary } from "@/lib/actions/gstr-export";
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

  const rows = await getGstr1HsnSummary(from, to);

  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: "hsnCode", label: "HSN" },
    { key: "description", label: "Description" },
    { key: "uqc", label: "UQC" },
    { key: "totalQuantity", label: "Total Quantity" , type: "money" },
    { key: "totalValue", label: "Total Value" , type: "money" },
    { key: "taxableValue", label: "Taxable Value" , type: "money" },
    { key: "integratedTaxAmount", label: "Integrated Tax Amount" },
    { key: "centralTaxAmount", label: "Central Tax Amount" },
    { key: "stateTaxAmount", label: "State/UT Tax Amount" },
    { key: "cessAmount", label: "Cess Amount" , type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: rows,
    columns,
    filename: `gstr1-hsn-${from}-to-${to}`,
  });
}
