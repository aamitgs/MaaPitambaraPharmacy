import { NextRequest, NextResponse } from "next/server";
import { getStockLedger } from "@/lib/actions/reports";
import { ledgerTypeLabel } from "@/lib/stock-ledger-labels";
import { defaultMonthRange } from "@/lib/date-range";
import { toCsv } from "@/lib/csv";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { from, to } = defaultMonthRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const rows = await getStockLedger(from, to);

  const csv = toCsv(rows, [
    { key: (r) => format(new Date(r.date), "yyyy-MM-dd HH:mm"), label: "Date" },
    { key: "branchName", label: "Branch" },
    { key: "itemName", label: "Item" },
    { key: "batchNo", label: "Batch" },
    { key: (r) => ledgerTypeLabel(r.type), label: "Type" },
    { key: "qtyChange", label: "Qty change" },
    { key: "reference", label: "Reference" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-ledger-${from}-to-${to}.csv"`,
    },
  });
}
