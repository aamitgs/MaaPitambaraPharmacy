import Link from "next/link";
import { auth } from "@/auth";
import { listPurchaseOrders } from "@/lib/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Plus } from "lucide-react";

const STATUS_VARIANT: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-warning/20 text-warning-foreground",
  received: "bg-success/15 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

export default async function PurchaseOrdersPage() {
  const session = await auth();
  const orders = await listPurchaseOrders();
  const canEdit = session?.user.role === "owner" || session?.user.role === "pharmacist";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">
            {orders.length} order{orders.length === 1 ? "" : "s"} · optional step before a GRN
          </p>
        </div>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/purchase-orders/new">
              <Plus /> New purchase order
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length ? (
              orders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>
                    <Link href={`/purchase-orders/${po.id}`} className="font-medium hover:underline">
                      {po.supplierName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(po.createdAt), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>{po.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{po.total.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_VARIANT[po.status]}>{po.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No purchase orders yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
