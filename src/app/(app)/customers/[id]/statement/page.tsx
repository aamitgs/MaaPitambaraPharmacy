import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getCustomerStatement } from "@/lib/actions/customers";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { PrintButton } from "@/components/reports/print-button";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { StatementWhatsAppButton } from "@/components/whatsapp/statement-whatsapp-button";
import { StatementEmailButton } from "@/components/email/statement-email-button";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ChevronLeft, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function CustomerStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const { id } = await params;
  const { from, to } = defaultMonthRange(await searchParams);
  const statement = await getCustomerStatement(id, from, to).catch(() => null);
  if (!statement) notFound();

  return (
    <div className="space-y-4 p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <Link
        href={`/customers/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ChevronLeft className="h-4 w-4" /> {statement.customerName}
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Statement of Account — {statement.customerName}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(from), "dd MMM yyyy")} – {format(new Date(to), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/export/customer-statement?customerId=${id}&from=${from}&to=${to}`}>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
          <PrintButton />
          <StatementWhatsAppButton
            customerId={id}
            from={from}
            to={to}
            defaultPhone={statement.customerPhone}
          />
          <StatementEmailButton customerId={id} from={from} to={to} />
        </div>
      </div>

      <DateRangeFilter from={from} to={to} basePath={`/customers/${id}/statement`} />

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Opening balance</div>
          <div className="text-xl font-semibold tabular-nums">₹{statement.openingBalance.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Closing balance</div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              statement.closingBalance > 0 && "text-destructive"
            )}
          >
            ₹{statement.closingBalance.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statement.lines.length ? (
              statement.lines.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(line.date), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{line.description}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.debit > 0 ? `₹${line.debit.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-success">
                    {line.credit > 0 ? `₹${line.credit.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    ₹{line.balance.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No activity in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
