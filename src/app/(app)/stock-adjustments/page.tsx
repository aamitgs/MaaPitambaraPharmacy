import Link from "next/link";
import { format } from "date-fns";
import { Plus, ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { listStockAdjustments } from "@/lib/actions/stock-adjustments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  expired: "Expired",
  damaged: "Damaged",
  lost: "Missing",
  found: "Found",
  sample: "Sample",
  recount: "Recount",
};

export default async function StockAdjustmentsPage() {
  if (!(await hasPermission("stock.adjust"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to adjust stock</p>
        <p className="text-sm">Ask the owner for the &ldquo;Write stock off&rdquo; permission.</p>
      </div>
    );
  }

  const rows = await listStockAdjustments();
  const writtenOffValue = rows
    .filter((r) => r.totalQty < 0)
    .reduce((s, r) => s + r.valueAtCost, 0);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Stock adjustments</h1>
          <p className="text-sm text-muted-foreground">
            Expired, damaged, missing or found stock. Each one is permanent — a mistake is
            corrected with a second, opposite adjustment.
          </p>
        </div>
        <Button asChild>
          <Link href="/stock-adjustments/new">
            <Plus className="h-4 w-4" /> New adjustment
          </Link>
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">Written off, all time: </span>
          <span className="font-semibold tabular-nums">₹{writtenOffValue.toFixed(2)}</span>
          <span className="text-muted-foreground"> at cost</span>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Value at cost</TableHead>
              <TableHead>Disposal ref</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No adjustments recorded yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.adjustmentNo}</TableCell>
                <TableCell>{format(new Date(r.adjustedAt), "dd MMM yyyy, h:mm a")}</TableCell>
                <TableCell>
                  <Badge variant={r.reason === "found" ? "secondary" : "outline"}>
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-64 text-xs text-muted-foreground">
                  {r.lines.map((l) => `${l.itemName} (${l.batchNo})`).join(", ")}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    r.totalQty < 0 ? "text-destructive" : "text-success"
                  )}
                >
                  {r.totalQty > 0 ? "+" : ""}
                  {r.totalQty}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ₹{r.valueAtCost.toFixed(2)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.disposalRef ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.byName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
