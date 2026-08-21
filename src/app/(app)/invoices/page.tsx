import Link from "next/link";
import { format } from "date-fns";
import { listInvoices } from "@/lib/actions/invoices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { InvoiceFilters } from "@/components/invoices/invoice-filters";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { invoices, matchCount, shownCount, matchedTotal, totalExcludesCancelled } =
    await listInvoices({
    q: params.q,
    medicine: params.medicine,
    from: params.from,
    to: params.to,
    paymentMode: params.paymentMode,
    status: params.status,
  });
  const filtered = Object.keys(params).length > 0;
  // The export has to carry the same filter, or "export" quietly means
  // something different from what is on screen.
  const exportQuery = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][]
  ).toString();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            {filtered ? (
              <>
                {matchCount} match{matchCount === 1 ? "" : "es"}
                {shownCount < matchCount && ` · showing the latest ${shownCount}`} · ₹
                {matchedTotal.toFixed(2)}{" "}
                {totalExcludesCancelled ? "billed" : "in these bills"}
              </>
            ) : (
              <>
                {matchCount} invoice{matchCount === 1 ? "" : "s"}
                {shownCount < matchCount && ` · showing the latest ${shownCount}`}
              </>
            )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/sales${exportQuery ? `?${exportQuery}` : ""}`} download>
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </Button>
      </div>

      <InvoiceFilters />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length ? (
              invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoiceNo}</TableCell>
                  <TableCell>{format(new Date(inv.invoiceDate), "dd MMM yyyy, HH:mm")}</TableCell>
                  <TableCell>{inv.customerName}</TableCell>
                  <TableCell>{PAYMENT_LABELS[inv.paymentMode] ?? inv.paymentMode}</TableCell>
                  <TableCell>
                    {inv.status === "completed" ? (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">
                        Completed
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                        Cancelled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">₹{inv.total.toFixed(2)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/invoices/${inv.id}/receipt`}
                      className="text-sm text-primary hover:underline"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No sales yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
