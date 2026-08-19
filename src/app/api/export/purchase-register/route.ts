import { NextRequest, NextResponse } from "next/server";
import { getPurchaseRegister } from "@/lib/actions/reports";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getPurchaseRegister(from, to);

  const csv = toCsv(rows, [
    { key: (r) => format(new Date(r.receivedAt), "yyyy-MM-dd HH:mm"), label: "Date" },
    { key: "branchName", label: "Branch" },
    { key: "supplierName", label: "Supplier" },
    { key: "supplierInvoiceNo", label: "Supplier invoice no." },
    { key: "itemCount", label: "Items" },
    { key: "total", label: "Total" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="purchase-register-${from}-to-${to}.csv"`,
    },
  });
}
