import Link from "next/link";
import { auth } from "@/auth";
import { getMarginReport } from "@/lib/actions/margin-movers";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default async function MarginReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const params = await searchParams;
  const { from, to } = defaultMonthRange(params);
  const sortByPercent = params.sort === "percent";

  const report = await getMarginReport(from, to);
  const sortRows = <T extends { margin: number; marginPercent: number }>(rows: T[]) =>
    [...rows].sort((a, b) => (sortByPercent ? b.marginPercent - a.marginPercent : b.margin - a.margin));

  const byItem = sortRows(report.byItem);
  const byHsn = sortRows(report.byHsn);

  const totals = report.byItem.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, margin: acc.margin + r.margin }),
    { revenue: 0, cost: 0, margin: 0 }
  );

  return (
    <div className="space-y-6 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Margin Report</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")} · Overall margin ₹
            {totals.margin.toFixed(2)} on ₹{totals.revenue.toFixed(2)} revenue
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <DateRangeFilter from={from} to={to} basePath="/reports/margin" />
        <div className="flex overflow-hidden rounded-md border">
          <Link
            href={`/reports/margin?from=${from}&to=${to}&sort=amount`}
            className={cn("px-2.5 py-1 text-xs", !sortByPercent ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            Sort by margin ₹
          </Link>
          <Link
            href={`/reports/margin?from=${from}&to=${to}&sort=percent`}
            className={cn("px-2.5 py-1 text-xs", sortByPercent ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            Sort by margin %
          </Link>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">By item</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byItem.length ? (
                byItem.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.qtySold}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.revenue.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.cost.toFixed(2)}</TableCell>
                    <TableCell
                      className={cn("text-right font-medium tabular-nums", r.margin < 0 && "text-destructive")}
                    >
                      ₹{r.margin.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", r.marginPercent < 0 && "text-destructive")}
                    >
                      {r.marginPercent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    No sales in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">By HSN code</h2>
        <p className="text-xs text-muted-foreground">
          No category field exists on the item master — HSN code is the closest existing grouping.
        </p>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HSN code</TableHead>
                <TableHead className="text-right">Qty sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byHsn.length ? (
                byHsn.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.qtySold}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.revenue.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{r.cost.toFixed(2)}</TableCell>
                    <TableCell
                      className={cn("text-right font-medium tabular-nums", r.margin < 0 && "text-destructive")}
                    >
                      ₹{r.margin.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", r.marginPercent < 0 && "text-destructive")}
                    >
                      {r.marginPercent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    No sales in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
