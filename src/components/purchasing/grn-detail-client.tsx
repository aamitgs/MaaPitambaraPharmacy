"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GrnEwayBillActions } from "@/components/einvoice/grn-ewaybill-actions";
import { ChevronLeft, FileImage, Printer } from "lucide-react";

export type GrnDetail = {
  id: string;
  supplier: { id: string; name: string; gstin: string | null; address: string | null };
  purchaseOrderId: string | null;
  supplierInvoiceNo: string;
  supplierInvoiceDate: Date;
  invoiceImageUrl: string | null;
  receivedAt: Date;
  receivedByName: string;
  total: number;
  ewayBillNo: string | null;
  ewayBillThreshold: number;
  items: {
    id: string;
    itemName: string;
    unit: string;
    batchNo: string;
    expiryDate: Date;
    mrp: number;
    rate: number;
    qty: number;
  }[];
};

export function GrnDetailClient({ grn, canEdit }: { grn: GrnDetail; canEdit: boolean }) {
  const total = grn.items.reduce((sum, i) => sum + i.qty * i.rate, 0);

  return (
    <div className="p-6">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/grn"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> GRNs
        </Link>
        <div className="flex items-center gap-2">
          {grn.invoiceImageUrl && (
            <Button asChild variant="outline" size="sm">
              {/* New tab rather than inline: the upload may be a PDF, and the
                  browser's own viewer handles both better than we would. */}
              <a
                href={`/api/files/purchase-invoices/${grn.invoiceImageUrl}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileImage className="h-4 w-4" /> Supplier bill
              </a>
            </Button>
          )}
          {grn.purchaseOrderId && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/purchase-orders/${grn.purchaseOrderId}`}>View linked PO</Link>
            </Button>
          )}
          {canEdit && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/purchase-returns/new?supplierId=${grn.supplier.id}&grnId=${grn.id}`}>
                Return items
              </Link>
            </Button>
          )}
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <GrnEwayBillActions
            grnId={grn.id}
            total={total}
            ewayBillThreshold={grn.ewayBillThreshold}
            hasEwayBill={!!grn.ewayBillNo}
          />
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 border p-6 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">Goods Received Note</h1>
            <p className="text-sm text-muted-foreground">
              Received {format(new Date(grn.receivedAt), "dd MMM yyyy, h:mm a")} by {grn.receivedByName}
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">Supplier invoice {grn.supplierInvoiceNo}</div>
            <div className="text-muted-foreground">
              {format(new Date(grn.supplierInvoiceDate), "dd MMM yyyy")}
            </div>
          </div>
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">{grn.supplier.name}</div>
          {grn.supplier.gstin && <div className="text-muted-foreground">GSTIN {grn.supplier.gstin}</div>}
          {grn.supplier.address && <div className="text-muted-foreground">{grn.supplier.address}</div>}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grn.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">
                  {i.itemName} <span className="text-muted-foreground">({i.unit})</span>
                </TableCell>
                <TableCell>{i.batchNo}</TableCell>
                <TableCell className="whitespace-nowrap">{format(new Date(i.expiryDate), "MMM yyyy")}</TableCell>
                <TableCell className="text-right tabular-nums">₹{i.mrp.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{i.rate.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">{i.qty}</TableCell>
                <TableCell className="text-right tabular-nums">₹{(i.qty * i.rate).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="text-right text-sm">
          Total: <span className="font-medium">₹{total.toFixed(2)}</span>
          {grn.ewayBillNo && (
            <div className="text-muted-foreground">E-way bill: {grn.ewayBillNo}</div>
          )}
        </div>
      </div>
    </div>
  );
}
