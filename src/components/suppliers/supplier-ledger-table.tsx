import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PlainSupplierLedgerEntry } from "@/lib/serialize";

const TYPE_LABEL: Record<PlainSupplierLedgerEntry["type"], string> = {
  purchase: "Purchase",
  payment: "Payment",
  return: "Return",
};

export function SupplierLedgerTable({ entries }: { entries: PlainSupplierLedgerEntry[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length ? (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {format(new Date(entry.createdAt), "dd MMM yyyy, h:mm a")}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{TYPE_LABEL[entry.type]}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {entry.note || entry.referenceType || "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    entry.amount > 0 ? "text-foreground" : "text-success"
                  )}
                >
                  {entry.amount > 0 ? "+" : ""}₹{entry.amount.toFixed(2)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                No ledger entries yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
