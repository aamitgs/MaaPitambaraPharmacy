import Link from "next/link";
import { format } from "date-fns";
import { listSalesReturns } from "@/lib/actions/sales-returns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const REFUND_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit_account: "Credit account",
};

export default async function SalesReturnsPage() {
  const returns = await listSalesReturns();

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Sales returns</h1>
        <p className="text-sm text-muted-foreground">
          Credit notes raised against customer bills. Start one from the bill itself.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Credit note</TableHead>
                <TableHead>Against</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Refund</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No returns yet.
                  </TableCell>
                </TableRow>
              )}
              {returns.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <Link href={`/sales-returns/${row.id}`} className="hover:underline">
                      {row.returnNo}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(row.returnedAt), "dd MMM yyyy, h:mm a")}
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Straight to the bill this reverses — checking what was
                        actually sold is the first thing anyone does here. */}
                    <Link
                      href={`/invoices/${row.invoiceId}/receipt`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {row.invoiceNo}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.reason}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {REFUND_LABELS[row.refundMethod] ?? row.refundMethod}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.createdByName}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    ₹{row.total.toFixed(2)}
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
