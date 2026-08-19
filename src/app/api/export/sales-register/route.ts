import { NextRequest, NextResponse } from "next/server";
import { getSalesRegister } from "@/lib/actions/reports";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getSalesRegister(from, to);

  const csv = toCsv(rows, [
    { key: "invoiceNo", label: "Invoice no." },
    { key: (r) => format(new Date(r.invoiceDate), "yyyy-MM-dd HH:mm"), label: "Date" },
    { key: "branchName", label: "Branch" },
    { key: "customerName", label: "Customer" },
    { key: "paymentMode", label: "Payment mode" },
    { key: "subtotal", label: "Subtotal" },
    { key: "discountAmount", label: "Discount" },
    { key: "taxAmount", label: "Tax" },
    { key: "total", label: "Total" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-register-${from}-to-${to}.csv"`,
    },
  });
}
