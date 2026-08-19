import { auth } from "@/auth";
import { getMoverReport } from "@/lib/actions/margin-movers";
import { defaultMonthRange } from "@/lib/date-range";
import { MoverFilters } from "@/components/reports/mover-filters";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { TriangleAlert } from "lucide-react";

const DEFAULT_THRESHOLD = 5;

export default async function MoversReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; threshold?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const params = await searchParams;
  const { from, to } = defaultMonthRange(params);
  const threshold = params.threshold ? Math.max(0, Number(params.threshold)) : DEFAULT_THRESHOLD;

  const rows = await getMoverReport(from, to, threshold);
  const slowMoverCount = rows.filter((r) => r.isSlowMover).length;

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold">Fast / Slow Movers</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} item{rows.length === 1 ? "" : "s"} in stock · {slowMoverCount} below {threshold} unit
            {threshold === 1 ? "" : "s"} sold · {format(new Date(from), "dd MMM yyyy")} –{" "}
            {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <PrintButton />
      </div>

      <MoverFilters from={from} to={to} threshold={threshold} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty sold</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.itemId} className={r.isSlowMover && r.hasNearExpiry ? "bg-destructive/5" : undefined}>
                  <TableCell className="font-medium">
                    {r.itemName} <span className="text-muted-foreground">({r.unit})</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.qtySold}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {r.isSlowMover ? (
                        <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
                          Slow mover
                        </Badge>
                      ) : (
                        <Badge className="bg-success/15 text-success hover:bg-success/15">Fast mover</Badge>
                      )}
                      {r.isSlowMover && r.hasNearExpiry && (
                        <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <TriangleAlert className="h-3 w-3" /> Near expiry — writeoff risk
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No stock to rank.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
