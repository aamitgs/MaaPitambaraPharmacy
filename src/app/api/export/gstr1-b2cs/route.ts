import type { NextRequest } from "next/server";
import { getGstr1B2cs } from "@/lib/actions/gstr-export";
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

  const rows = await getGstr1B2cs(from, to);

  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: "type", label: "Type" },
    { key: "placeOfSupply", label: "Place Of Supply" },
    { key: "taxRate", label: "Applicable % of Tax Rate" },
    { key: "taxRate", label: "Rate" , type: "money" },
    { key: "taxableValue", label: "Taxable Value" , type: "money" },
    { key: "cessAmount", label: "Cess Amount" , type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: rows,
    columns,
    filename: `gstr1-b2cs-${from}-to-${to}`,
  });
}
