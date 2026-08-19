import { auth } from "@/auth";
import { getStockLedger } from "@/lib/actions/reports";
import { ledgerTypeLabel } from "@/lib/stock-ledger-labels";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download } from "lucide-react";

export default async function StockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const rows = await getStockLedger(from, to);

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Stock Ledger</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} movement{rows.length === 1 ? "" : "s"} · {format(new Date(from), "dd MMM yyyy")} –{" "}
            {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/stock-ledger?from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/stock-ledger" />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Qty change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(r.date), "dd MMM yyyy, h:mm a")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.branchName}</TableCell>
                  <TableCell className="font-medium">{r.itemName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.batchNo}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ledgerTypeLabel(r.type)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reference}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-medium ${
                      r.qtyChange > 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {r.qtyChange > 0 ? `+${r.qtyChange}` : r.qtyChange}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No stock movements in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
