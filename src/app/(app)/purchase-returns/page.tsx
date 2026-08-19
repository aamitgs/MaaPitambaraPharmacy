import Link from "next/link";
import { auth } from "@/auth";
import { listPurchaseReturns } from "@/lib/actions/purchase-returns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Plus } from "lucide-react";

export default async function PurchaseReturnsPage() {
  const session = await auth();
  const returns = await listPurchaseReturns();
  const canEdit = session?.user.role === "owner" || session?.user.role === "pharmacist";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Purchase Returns</h1>
          <p className="text-sm text-muted-foreground">
            {returns.length} return{returns.length === 1 ? "" : "s"} recorded
          </p>
        </div>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/purchase-returns/new">
              <Plus /> New return
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
              <TableHead>Reason</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {returns.length ? (
              returns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/purchase-returns/${r.id}`} className="font-medium hover:underline">
                      {r.supplierName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(r.returnDate), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reason || "—"}</TableCell>
                  <TableCell>{r.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{r.totalAmount.toFixed(2)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No purchase returns yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
