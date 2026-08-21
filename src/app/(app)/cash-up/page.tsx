import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { getCashUpDraft, listCashUps } from "@/lib/actions/cash-up";
import { CashUpForm } from "@/components/cash-up/cash-up-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default async function CashUpPage() {
  if (!(await hasPermission("cashup.manage"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to count the till</p>
        <p className="text-sm">
          Ask the owner to grant your role the &ldquo;Count the till and close a shift&rdquo;
          permission.
        </p>
      </div>
    );
  }

  const [draft, history] = await Promise.all([getCashUpDraft(), listCashUps()]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Cash-up</h1>
        <p className="text-sm text-muted-foreground">
          Count the drawer at the end of a shift. Each count is recorded as it was — a later
          refund never rewrites a shift somebody already signed off.
        </p>
      </div>

      <CashUpForm draft={draft} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Previous counts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Closed</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Cash takings</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No shifts closed yet.
                  </TableCell>
                </TableRow>
              )}
              {history.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {format(new Date(row.closedAt), "dd MMM yyyy, h:mm a")}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(row.periodStart), "h:mm a")} –{" "}
                      {format(new Date(row.periodEnd), "h:mm a")}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.countedByName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{row.cashSales.toFixed(2)}
                    {row.cashRefunds > 0 && (
                      <div className="text-xs text-destructive">
                        −₹{row.cashRefunds.toFixed(2)} refunded
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{row.expectedCash.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{row.countedCash.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      row.variance === 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {row.variance === 0
                      ? "—"
                      : `${row.variance > 0 ? "+" : "−"}₹${Math.abs(row.variance).toFixed(2)}`}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                    {row.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
