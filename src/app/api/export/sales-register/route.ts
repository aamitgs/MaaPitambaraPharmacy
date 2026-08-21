import type { NextRequest } from "next/server";
import { getSalesRegister } from "@/lib/actions/reports";
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

  const rows = await getSalesRegister(from, to);

  const columns: ExportColumn<(typeof rows)[number]>[] = [
    { key: "invoiceNo", label: "Invoice no." },
    { key: (r) => format(new Date(r.invoiceDate), "yyyy-MM-dd HH:mm"), label: "Date" },
    { key: "branchName", label: "Branch" },
    { key: "customerName", label: "Customer" },
    { key: "paymentMode", label: "Payment mode" },
    { key: "subtotal", label: "Subtotal" , type: "money" },
    { key: "discountAmount", label: "Discount" , type: "money" },
    { key: "taxAmount", label: "Tax" , type: "money" },
    { key: "total", label: "Total" , type: "money" },
  ];

  return exportResponse({
    format: formatFromRequest(searchParams),
    rows: rows,
    columns,
    filename: `sales-register-${from}-to-${to}`,
  });
}
