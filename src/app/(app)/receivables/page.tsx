import Link from "next/link";
import { ShieldAlert, Phone } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { getReceivables } from "@/lib/actions/receivables";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const BUCKETS = [
  { key: "current", label: "Not yet due" },
  { key: "1-30", label: "1–30 days" },
  { key: "31-60", label: "31–60" },
  { key: "61-90", label: "61–90" },
  { key: "90+", label: "90+" },
] as const;

export default async function ReceivablesPage() {
  if (!(await hasPermission("customers.manage"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to see receivables</p>
      </div>
    );
  }

  const { rows, totalOutstanding, totalOverdue } = await getReceivables();

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Receivables</h1>
        <p className="text-sm text-muted-foreground">
          Who owes what, and how late. Payments are applied to the oldest charge first, which is
          how a customer expects money handed over to be counted.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className="text-xl font-semibold tabular-nums">
            ₹{totalOutstanding.toFixed(2)}
          </div>
        </div>
        <div
          className={cn(
            "rounded-lg border p-3",
            totalOverdue > 0 && "border-destructive/40 bg-destructive/5"
          )}
        >
          <div className="text-xs text-muted-foreground">Overdue</div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              totalOverdue > 0 && "text-destructive"
            )}
          >
            ₹{totalOverdue.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              {BUCKETS.map((b) => (
                <TableHead key={b.key} className="text-right">
                  {b.label}
                </TableHead>
              ))}
              <TableHead className="text-right">Oldest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nothing outstanding on any credit account.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.customerId}>
                <TableCell>
                  <Link href={`/customers/${r.customerId}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="h-3 w-3" /> {r.phone}
                    </a>
                  )}
                  {r.creditTermDays === null && (
                    <Badge variant="outline" className="mt-1">
                      No credit term set
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  ₹{r.balance.toFixed(2)}
                </TableCell>
                {BUCKETS.map((b) => {
                  const value = r.buckets[b.key];
                  return (
                    <TableCell
                      key={b.key}
                      className={cn(
                        "text-right tabular-nums",
                        value === 0 && "text-muted-foreground/40",
                        value > 0 && b.key === "90+" && "font-medium text-destructive",
                        value > 0 && b.key === "61-90" && "text-destructive"
                      )}
                    >
                      {value === 0 ? "—" : `₹${value.toFixed(2)}`}
                    </TableCell>
                  );
                })}
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    r.oldestOverdueDays > 0 && "font-medium text-destructive"
                  )}
                >
                  {r.oldestOverdueDays > 0 ? `${r.oldestOverdueDays}d` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
