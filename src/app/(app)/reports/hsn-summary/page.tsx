import { auth } from "@/auth";
import { getHsnSummary } from "@/lib/actions/hsn-summary";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download } from "lucide-react";

export default async function HsnSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const rows = await getHsnSummary(from, to);

  const totals = rows.reduce(
    (acc, r) => ({
      taxableValue: acc.taxableValue + r.taxableValue,
      cgstAmount: acc.cgstAmount + r.cgstAmount,
      sgstAmount: acc.sgstAmount + r.sgstAmount,
      taxAmount: acc.taxAmount + r.taxAmount,
      totalValue: acc.totalValue + r.totalValue,
    }),
    { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, taxAmount: 0, totalValue: 0 }
  );

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">HSN-wise Summary</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} HSN/rate group{rows.length === 1 ? "" : "s"} · {format(new Date(from), "dd MMM yyyy")} –{" "}
            {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/hsn-summary?from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/hsn-summary" />

      <div className="hidden text-center print:block">
        <h1 className="text-lg font-semibold">HSN-wise Summary</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")}
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HSN code</TableHead>
              <TableHead className="text-right">Tax rate</TableHead>
              <TableHead className="text-right">Taxable value</TableHead>
              <TableHead className="text-right">CGST</TableHead>
              <TableHead className="text-right">SGST</TableHead>
              <TableHead className="text-right">Total tax</TableHead>
              <TableHead className="text-right">Total value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={`${r.hsnCode}-${r.taxRate}`}>
                  <TableCell className="font-medium">{r.hsnCode}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.taxRate}%</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.taxableValue.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.cgstAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.sgstAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.taxAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    ₹{r.totalValue.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No sales in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.taxableValue.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.cgstAmount.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.sgstAmount.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.taxAmount.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{totals.totalValue.toFixed(2)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
