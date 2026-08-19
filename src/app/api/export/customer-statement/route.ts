import { NextRequest, NextResponse } from "next/server";
import { getCustomerStatement } from "@/lib/actions/customers";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const customerId = searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const statement = await getCustomerStatement(customerId, from, to);

  const csv = toCsv(statement.lines, [
    { key: (r) => format(new Date(r.date), "yyyy-MM-dd"), label: "Date" },
    { key: "description", label: "Description" },
    { key: (r) => (r.debit > 0 ? r.debit.toFixed(2) : ""), label: "Debit" },
    { key: (r) => (r.credit > 0 ? r.credit.toFixed(2) : ""), label: "Credit" },
    { key: (r) => r.balance.toFixed(2), label: "Balance" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${statement.customerName.replace(/\s+/g, "-")}-${from}-to-${to}.csv"`,
    },
  });
}
