import Link from "next/link";
import { auth } from "@/auth";
import { listStockTransfers } from "@/lib/actions/stock-transfers";
import { resolveSelectedBranch } from "@/lib/branch-scope";
import { TransferActions } from "@/components/transfers/transfer-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Plus } from "lucide-react";

export default async function TransfersPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [transfers, scope] = await Promise.all([
    listStockTransfers(),
    resolveSelectedBranch(session.user.tenantId, session.user.role),
  ]);

  const canDecide = session.user.role === "owner" || session.user.role === "pharmacist";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stock Transfers</h1>
          <p className="text-sm text-muted-foreground">
            {transfers.length} transfer{transfers.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/transfers/new">
            <Plus /> Request transfer
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.length ? (
              transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.fromBranchName}</TableCell>
                  <TableCell className="font-medium">{t.toBranchName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.items.map((i) => `${i.itemName} (${i.qty} ${i.unit})`).join(", ")}
                  </TableCell>
                  <TableCell className="text-sm">{t.requestedByName}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(t.createdAt), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    {t.status === "pending" ? (
                      <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">Pending</Badge>
                    ) : t.status === "completed" ? (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">Completed</Badge>
                    ) : t.status === "rejected" ? (
                      <Badge variant="outline">Rejected</Badge>
                    ) : (
                      <Badge variant="outline">{t.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canDecide &&
                      t.status === "pending" &&
                      (scope.isAllBranches || t.fromBranchId === scope.branchId) && (
                        <TransferActions transferId={t.id} />
                      )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No transfers yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
