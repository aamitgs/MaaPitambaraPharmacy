import { auth } from "@/auth";
import { getDiscountReport } from "@/lib/actions/discount-report";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/reports/export-buttons";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  item: "Item discount",
  bill: "Bill discount",
  scheme: "Scheme",
  loyalty: "Loyalty tier",
  coupon: "Coupon",
};

export default async function DiscountReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { from, to } = defaultMonthRange(await searchParams);
  const report = await getDiscountReport(from, to);

  return (
    <div className="space-y-6 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Discount Report</h1>
          <p className="text-sm text-muted-foreground">
            ₹{report.total.toFixed(2)} total discount given · {format(new Date(from), "dd MMM yyyy")} –{" "}
            {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons href={`/api/export/discount-report?from=${from}&to=${to}`} />
          <PrintButton />
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/discounts" />

      <div className="grid grid-cols-2 gap-6">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">By staff member</h2>
          <p className="text-xs text-muted-foreground">Who gave the most discounts</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="text-right">Discounts</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.byStaff.length ? (
                  report.byStaff.map((s) => (
                    <TableRow key={s.userId}>
                      <TableCell className="font-medium">{s.userName}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{s.count}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">₹{s.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                      No discounts in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">By discount type</h2>
          <p className="text-xs text-muted-foreground">Item / bill / scheme / loyalty / coupon split</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.byType.length ? (
                  report.byType.map((t) => (
                    <TableRow key={t.type}>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABELS[t.type] ?? t.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{t.count}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">₹{t.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                      No discounts in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">By item</h2>
          <p className="text-xs text-muted-foreground">
            Item-level and scheme discounts only — bill/loyalty/coupon discounts apply to the whole sale, not one item
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.byItem.length ? (
                  report.byItem.slice(0, 15).map((i) => (
                    <TableRow key={i.itemId}>
                      <TableCell className="font-medium">{i.itemName}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">₹{i.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="h-20 text-center text-muted-foreground">
                      No discounts in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">By scheme</h2>
          <p className="text-xs text-muted-foreground">Which scheme cost the most</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheme</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.byScheme.length ? (
                  report.byScheme.map((s) => (
                    <TableRow key={s.schemeId}>
                      <TableCell className="font-medium">{s.schemeName}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">₹{s.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="h-20 text-center text-muted-foreground">
                      No scheme discounts in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">By day</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.byDay.length ? (
                report.byDay.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{format(new Date(d.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">₹{d.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="h-20 text-center text-muted-foreground">
                    No discounts in this period.
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
