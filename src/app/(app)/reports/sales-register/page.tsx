import { auth } from "@/auth";
import { getSalesRegister } from "@/lib/actions/reports";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download } from "lucide-react";

export default async function SalesRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const rows = await getSalesRegister(from, to);

  const totals = rows.reduce(
    (acc, r) => ({
      subtotal: acc.subtotal + r.subtotal,
      discountAmount: acc.discountAmount + r.discountAmount,
      taxAmount: acc.taxAmount + r.taxAmount,
      total: acc.total + r.total,
    }),
    { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 }
  );

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Sales Register</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} invoice{rows.length === 1 ? "" : "s"} · {format(new Date(from), "dd MMM yyyy")} –{" "}
            {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/sales-register?from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/sales-register" />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.invoiceNo}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(r.invoiceDate), "dd MMM yyyy, h:mm a")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.branchName}</TableCell>
                  <TableCell className="text-sm">{r.customerName}</TableCell>
                  <TableCell className="text-sm capitalize">{r.paymentMode}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.subtotal.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.discountAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.taxAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">₹{r.total.toFixed(2)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No sales in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.subtotal.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.discountAmount.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.taxAmount.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.total.toFixed(2)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
