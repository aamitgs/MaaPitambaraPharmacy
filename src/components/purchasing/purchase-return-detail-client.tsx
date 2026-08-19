"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Printer } from "lucide-react";

export type PurchaseReturnDetail = {
  id: string;
  supplier: { name: string; gstin: string | null; address: string | null };
  grnId: string | null;
  returnDate: Date;
  reason: string | null;
  createdByName: string;
  totalAmount: number;
  items: {
    id: string;
    itemName: string;
    unit: string;
    batchNo: string;
    qty: number;
    rate: number;
  }[];
};

export function PurchaseReturnDetailClient({ ret }: { ret: PurchaseReturnDetail }) {
  return (
    <div className="p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/purchase-returns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Purchase Returns
        </Link>
        <div className="flex items-center gap-2">
          {ret.grnId && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/grn/${ret.grnId}`}>View source GRN</Link>
            </Button>
          )}
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 border p-6 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">Debit Note — Purchase Return</h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(ret.returnDate), "dd MMM yyyy, h:mm a")} by {ret.createdByName}
            </p>
          </div>
          {ret.reason && (
            <div className="max-w-xs text-right text-sm text-muted-foreground">Reason: {ret.reason}</div>
          )}
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">{ret.supplier.name}</div>
          {ret.supplier.gstin && <div className="text-muted-foreground">GSTIN {ret.supplier.gstin}</div>}
          {ret.supplier.address && <div className="text-muted-foreground">{ret.supplier.address}</div>}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ret.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">
                  {i.itemName} <span className="text-muted-foreground">({i.unit})</span>
                </TableCell>
                <TableCell>{i.batchNo}</TableCell>
                <TableCell className="text-right tabular-nums">{i.qty}</TableCell>
                <TableCell className="text-right tabular-nums">₹{i.rate.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{(i.qty * i.rate).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="text-right text-sm">
          Total credit claimed: <span className="font-medium">₹{ret.totalAmount.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
