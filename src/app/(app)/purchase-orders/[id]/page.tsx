import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getPurchaseOrder } from "@/lib/actions/purchase-orders";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PoStatusActions } from "@/components/purchasing/po-status-actions";
import { format } from "date-fns";
import { ChevronLeft, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_VARIANT: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-warning/20 text-warning-foreground",
  received: "bg-success/15 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const canEdit = session.user.role === "owner" || session.user.role === "pharmacist";
  const total = po.items.reduce((sum, i) => sum + i.qty * i.rate, 0);

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/purchase-orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Purchase Orders
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{po.supplier.name}</h1>
            <Badge className={STATUS_VARIANT[po.status]}>{po.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Raised {format(new Date(po.createdAt), "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {po.documentImageUrl && (
            <Button asChild variant="outline" size="sm">
              {/* New tab rather than inline: the upload may be a PDF, and the
                  browser's own viewer handles both better than we would. */}
              <a
                href={`/api/files/purchase-invoices/${po.documentImageUrl}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileImage className="h-4 w-4" /> Quotation
              </a>
            </Button>
          )}
          {canEdit && <PoStatusActions poId={po.id} status={po.status} supplierId={po.supplier.id} />}
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">
                  {i.itemName} <span className="text-muted-foreground">({i.unit})</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{i.qty}</TableCell>
                <TableCell className="text-right tabular-nums">₹{i.rate.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">₹{(i.qty * i.rate).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="text-right text-sm text-muted-foreground">
        Total: <span className="font-medium text-foreground">₹{total.toFixed(2)}</span>
      </div>

      {po.grns.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">GRNs received against this order</h2>
          <div className="space-y-1">
            {po.grns.map((g) => (
              <Link
                key={g.id}
                href={`/grn/${g.id}`}
                className="block rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
              >
                Invoice {g.supplierInvoiceNo} · {format(new Date(g.receivedAt), "dd MMM yyyy")}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
