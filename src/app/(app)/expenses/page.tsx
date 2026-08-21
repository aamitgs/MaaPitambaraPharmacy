import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { listExpenses, listExpenseCategories } from "@/lib/actions/expenses";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  if (!(await hasPermission("reports.view"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to see expenses</p>
      </div>
    );
  }

  const { from, to } = defaultMonthRange(await searchParams);
  const [expenses, categories] = await Promise.all([
    listExpenses(from, to),
    listExpenseCategories(),
  ]);
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Running costs — rent, salaries, electricity. Stock purchases are not entered here;
            they come through GRN and become a cost when the stock sells.
          </p>
        </div>
        <ExpenseForm categories={categories} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter from={from} to={to} basePath="/expenses" />
        <div className="rounded-lg border px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Total </span>
          <span className="font-semibold tabular-nums">₹{total.toFixed(2)}</span>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Paid to</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nothing recorded in this period.
                </TableCell>
              </TableRow>
            )}
            {expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{format(new Date(e.incurredOn), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  {e.categoryName}
                  {e.isRecurring && (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      monthly
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.payee ?? "—"}</TableCell>
                <TableCell className="capitalize">{e.paymentMode}</TableCell>
                <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                  {e.note ?? ""}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  ₹{e.amount.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
