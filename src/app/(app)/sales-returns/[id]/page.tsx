import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getSalesReturn } from "@/lib/actions/sales-returns";
import { PrintButton } from "@/components/reports/print-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const REFUND_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit_account: "Credit account",
};

export default async function SalesReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getSalesReturn(id);
  if (!data) notFound();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/sales-returns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Sales returns
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/invoices/${data.invoiceId}/receipt`}>
              <ExternalLink className="h-4 w-4" /> View invoice
            </Link>
          </Button>
          <PrintButton />
        </div>
      </div>

      {/* A4 credit note, matching how purchase returns print a debit note. */}
      <div className="mx-auto max-w-3xl space-y-4 rounded-lg border bg-white p-8 text-black print:border-0">
        <div className="text-center">
          <div className="text-lg font-bold">{data.pharmacyName}</div>
          <div className="text-xs whitespace-pre-line">{data.branch.licensedAddress}</div>
          {data.branch.gstin && <div className="text-xs">GSTIN: {data.branch.gstin}</div>}
          <div className="mt-2 text-sm font-bold tracking-[0.2em]">CREDIT NOTE</div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-y py-2 text-xs">
          <div>Credit note: {data.returnNo}</div>
          <div className="text-right">
            {format(new Date(data.returnedAt), "dd/MM/yyyy HH:mm")}
          </div>
          <div>
            Against invoice: {data.invoiceNo} (
            {format(new Date(data.invoiceDate), "dd/MM/yyyy")})
          </div>
          <div className="text-right">
            Refund by: {REFUND_LABELS[data.refundMethod] ?? data.refundMethod}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">GST%</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.itemName}</TableCell>
                <TableCell>{line.batchNo}</TableCell>
                <TableCell className="text-right tabular-nums">{line.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{line.rate.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">{line.taxRate}</TableCell>
                <TableCell className="text-xs">
                  {line.restock ? "Returned to stock" : "Written off"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {line.lineTotal.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="ml-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Taxable value</span>
            <span className="tabular-nums">₹{data.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>CGST</span>
            <span className="tabular-nums">₹{(data.taxAmount / 2).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>SGST</span>
            <span className="tabular-nums">
              ₹{(data.taxAmount - data.taxAmount / 2).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-t pt-1 font-bold">
            <span>Refunded</span>
            <span className="tabular-nums">₹{data.total.toFixed(2)}</span>
          </div>
        </div>

        <div className="border-t pt-2 text-xs">
          <div>Reason: {data.reason}</div>
          <div>Processed by: {data.createdByName}</div>
        </div>
      </div>
    </div>
  );
}
