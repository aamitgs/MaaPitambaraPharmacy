import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BatchForm } from "@/components/items/batch-form";
import { cn } from "@/lib/utils";
import type { PlainBatch } from "@/lib/serialize";

export function BatchesTable({
  itemId,
  batches,
  showPurchaseRate,
  nearExpiryWindowDays,
  canEdit,
  canPricePtr,
}: {
  itemId: string;
  batches: PlainBatch[];
  showPurchaseRate: boolean;
  nearExpiryWindowDays: number;
  canEdit: boolean;
  canPricePtr: boolean;
}) {
  const now = new Date();
  const nearExpiryCutoff = new Date(now.getTime() + nearExpiryWindowDays * 86400000);

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>MRP</TableHead>
            <TableHead>Sale rate</TableHead>
            {canPricePtr && <TableHead>PTR</TableHead>}
            {showPurchaseRate && <TableHead>Purchase rate</TableHead>}
            <TableHead>Qty</TableHead>
            <TableHead>Rack</TableHead>
            <TableHead>Status</TableHead>
            {canEdit && <TableHead className="w-16" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.length ? (
            batches.map((batch) => {
              const expired = batch.currentQty > 0 && batch.expiryDate < now;
              const nearExpiry =
                batch.currentQty > 0 &&
                batch.expiryDate >= now &&
                batch.expiryDate <= nearExpiryCutoff;
              return (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium">{batch.batchNo}</TableCell>
                  <TableCell className={cn(expired && "text-destructive")}>
                    {format(new Date(batch.expiryDate), "MMM yyyy")}
                  </TableCell>
                  <TableCell>₹{Number(batch.mrp).toFixed(2)}</TableCell>
                  <TableCell>₹{Number(batch.saleRate).toFixed(2)}</TableCell>
                  {canPricePtr && (
                    <TableCell className={cn(batch.ptr == null && "text-muted-foreground/40")}>
                      {batch.ptr == null ? "—" : `₹${Number(batch.ptr).toFixed(2)}`}
                    </TableCell>
                  )}
                  {showPurchaseRate && (
                    <TableCell>₹{Number(batch.purchaseRate).toFixed(2)}</TableCell>
                  )}
                  <TableCell
                    className={cn("tabular-nums", batch.currentQty === 0 && "text-destructive")}
                  >
                    {batch.currentQty}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {batch.rackLocation || "—"}
                  </TableCell>
                  <TableCell>
                    {expired ? (
                      <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                        Expired
                      </Badge>
                    ) : nearExpiry ? (
                      <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
                        Near expiry
                      </Badge>
                    ) : batch.currentQty === 0 ? (
                      <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                        Out of stock
                      </Badge>
                    ) : (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">OK</Badge>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <BatchForm
                        itemId={itemId}
                        batch={batch}
                        showPurchaseRate={showPurchaseRate}
                        canPricePtr={canPricePtr}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={8 + (showPurchaseRate ? 1 : 0) + (canPricePtr ? 1 : 0)}
                className="h-20 text-center text-muted-foreground"
              >
                No batches yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
