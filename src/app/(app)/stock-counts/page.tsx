import Link from "next/link";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { listStockCounts } from "@/lib/actions/stock-counts";
import { StartCountButton } from "@/components/stock/start-count-button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default async function StockCountsPage() {
  if (!(await hasPermission("stock.adjust"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to count stock</p>
        <p className="text-sm">Ask the owner for the &ldquo;Write stock off&rdquo; permission.</p>
      </div>
    );
  }

  const counts = await listStockCounts();
  const openCount = counts.find((c) => c.status === "in_progress");

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Stock counts</h1>
          <p className="text-sm text-muted-foreground">
            Walk the shelves and reconcile what is there against what the system believes. Posting
            a count corrects stock through a recount adjustment, so the stock ledger keeps one
            story.
          </p>
        </div>
        <StartCountButton hasOpenCount={Boolean(openCount)} openCountId={openCount?.id ?? null} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Progress</TableHead>
              <TableHead className="text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {counts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No stock counts yet.
                </TableCell>
              </TableRow>
            )}
            {counts.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/stock-counts/${c.id}`} className="font-medium hover:underline">
                    {c.countNo}
                  </Link>
                </TableCell>
                <TableCell>{format(new Date(c.startedAt), "dd MMM yyyy, HH:mm")}</TableCell>
                <TableCell className="text-muted-foreground">{c.startedByName}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      c.status === "in_progress"
                        ? "outline"
                        : c.status === "completed"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {c.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.countedCount}/{c.lineCount}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    c.varianceValue < 0 && "text-destructive",
                    c.varianceValue > 0 && "text-success"
                  )}
                >
                  {c.varianceValue === 0
                    ? "—"
                    : `${c.varianceValue > 0 ? "+" : "−"}₹${Math.abs(c.varianceValue).toFixed(2)}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
