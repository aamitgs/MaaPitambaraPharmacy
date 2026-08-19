import Link from "next/link";
import { auth } from "@/auth";
import { listGrns } from "@/lib/actions/grn";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Plus } from "lucide-react";

export default async function GrnListPage() {
  const session = await auth();
  const grns = await listGrns();
  const canEdit = session?.user.role === "owner" || session?.user.role === "pharmacist";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Goods Received (GRN)</h1>
          <p className="text-sm text-muted-foreground">
            {grns.length} GRN{grns.length === 1 ? "" : "s"} recorded
          </p>
        </div>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/grn/new">
              <Plus /> New GRN
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Supplier invoice no.</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grns.length ? (
              grns.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <Link href={`/grn/${g.id}`} className="font-medium hover:underline">
                      {g.supplierName}
                    </Link>
                  </TableCell>
                  <TableCell>{g.supplierInvoiceNo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(g.receivedAt), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>{g.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{g.total.toFixed(2)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No GRNs recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
