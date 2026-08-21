import { auth } from "@/auth";
import { getPurchaseRegister } from "@/lib/actions/reports";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/reports/export-buttons";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download } from "lucide-react";

export default async function PurchaseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const rows = await getPurchaseRegister(from, to);
  const totalAmount = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Purchase Register</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} GRN{rows.length === 1 ? "" : "s"} · {format(new Date(from), "dd MMM yyyy")} –{" "}
            {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons href={`/api/export/purchase-register?from=${from}&to=${to}`} />
          <PrintButton />
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/purchase-register" />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Invoice no.</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(r.receivedAt), "dd MMM yyyy, h:mm a")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.branchName}</TableCell>
                  <TableCell className="font-medium">{r.supplierName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.supplierInvoiceNo}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.itemCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">₹{r.total.toFixed(2)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No purchases in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell className="text-right tabular-nums">₹{totalAmount.toFixed(2)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
