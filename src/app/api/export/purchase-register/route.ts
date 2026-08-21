import type { NextRequest } from "next/server";
import { getPurchaseRegister } from "@/lib/actions/reports";
import { defaultMonthRange } from "@/lib/date-range";
import {
  exportResponse,
  formatFromRequest,
  type ExportColumn,
} from "@/lib/export-response";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getPurchaseRegister(from, to);

  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: (r) => format(new Date(r.receivedAt), "yyyy-MM-dd HH:mm"), label: "Date" },
    { key: "branchName", label: "Branch" },
    { key: "supplierName", label: "Supplier" },
    { key: "supplierInvoiceNo", label: "Supplier invoice no." },
    { key: "itemCount", label: "Items" },
    { key: "total", label: "Total" , type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: rows,
    columns,
    filename: `purchase-register-${from}-to-${to}`,
  });
}
