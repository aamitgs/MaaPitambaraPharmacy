"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createPurchaseOrderFromSuggestions,
  type ReorderGroup,
} from "@/lib/actions/reorder";
import { Loader2, PackageCheck, Repeat, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const BASIS_LABEL: Record<string, string> = {
  velocity: "Covers 30 days of sales",
  "reorder-level": "Back up to reorder level",
  minimum: "Minimum",
};

export function ReorderSuggestions({ groups }: { groups: ReorderGroup[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Qty and inclusion are per item, keyed by id — a suggestion is a starting
  // point, not an instruction, so every line stays editable.
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups.flatMap((g) => g.lines.map((l) => [l.itemId, String(l.suggestedQty)]))
    )
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  function createFor(group: ReorderGroup) {
    if (!group.supplierId) return;
    const items = group.lines
      .filter((l) => !excluded.has(l.itemId) && Number(qty[l.itemId]) > 0)
      .map((l) => ({
        itemId: l.itemId,
        qty: Number(qty[l.itemId]),
        rate: l.lastRate ?? 0,
      }));
    if (items.length === 0) {
      toast.error("Nothing selected for this supplier");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createPurchaseOrderFromSuggestions({
          supplierId: group.supplierId!,
          items,
        });
        toast.success(`Draft order created for ${result.supplierName}`);
        router.push(`/purchase-orders/${result.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create the order");
      }
    });
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <PackageCheck className="h-8 w-8 text-success" />
        <p className="text-sm font-medium text-foreground">Nothing needs reordering</p>
        <p className="text-sm">Every item is at or above its reorder level.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Reorder suggestions</h1>
        <p className="text-sm text-muted-foreground">
          Items below their reorder level, grouped by the supplier who last delivered them.
          Quantities cover 30 days at the last 60 days&apos; selling rate, or bring stock back to
          the reorder level — whichever is larger. Every figure is editable, and this creates a{" "}
          <span className="font-medium">draft</span> order for you to review before sending.
        </p>
      </div>

      {groups.map((group) => (
        <div key={group.supplierId ?? "none"} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium">{group.supplierName}</div>
              <div className="text-xs text-muted-foreground">
                {group.lines.length} item{group.lines.length === 1 ? "" : "s"} · about ₹
                {group.estimatedValue.toFixed(2)} at last purchase rates
              </div>
            </div>
            {group.supplierId ? (
              <Button disabled={pending} onClick={() => createFor(group)}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create draft order
              </Button>
            ) : (
              <Badge variant="outline">Pick a supplier manually</Badge>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Item</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Reorder at</TableHead>
                <TableHead className="text-right">Sells/day</TableHead>
                <TableHead className="text-right">Cover</TableHead>
                <TableHead className="w-28 text-right">Order</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.lines.map((l) => {
                const off = excluded.has(l.itemId);
                const q = Number(qty[l.itemId]) || 0;
                return (
                  <TableRow key={l.itemId} className={cn(off && "opacity-40")}>
                    <TableCell>
                      <Checkbox
                        checked={!off}
                        aria-label={`Include ${l.itemName}`}
                        onCheckedChange={(v) =>
                          setExcluded((s) => {
                            const next = new Set(s);
                            if (v) next.delete(l.itemId);
                            else next.add(l.itemId);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{l.itemName}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {l.basis === "velocity" && <TrendingUp className="h-3 w-3" />}
                        {BASIS_LABEL[l.basis] ?? l.basis}
                        {l.packSize && ` · ${l.packSize}`}
                      </div>
                      {l.alternativesInStock.length > 0 && (
                        // Worth seeing before ordering: the same medicine
                        // under another brand is already paid for and on
                        // the shelf.
                        <div className="mt-0.5 flex items-start gap-1 text-xs text-warning-foreground">
                          <Repeat className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            Same composition in stock:{" "}
                            {l.alternativesInStock
                              .map((a) => `${a.name} (${a.qty})`)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        l.currentQty === 0 && "font-medium text-destructive"
                      )}
                    >
                      {l.currentQty}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {l.reorderLevel}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {l.dailyVelocity > 0 ? l.dailyVelocity.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.daysOfCover === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={cn(l.daysOfCover < 7 && "font-medium text-destructive")}>
                          {l.daysOfCover}d
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="text-right"
                        value={qty[l.itemId] ?? ""}
                        disabled={off}
                        onChange={(e) => setQty((s) => ({ ...s, [l.itemId]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.lastRate === null ? (
                        <span className="text-muted-foreground">no rate</span>
                      ) : (
                        `₹${(q * l.lastRate).toFixed(2)}`
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
