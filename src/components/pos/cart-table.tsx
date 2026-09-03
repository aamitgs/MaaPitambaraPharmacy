"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CartLine } from "@/store/cart-store";
import type { SchemeApplication } from "@/lib/scheme-engine";
import type { PosItem } from "./types";
import { looseUnitRate } from "@/lib/loose-stock";

/** Whether the item master allows breaking a pack for this line. */
const looseAllowedByItem = (item: PosItem | undefined) => Boolean(item?.allowLooseSale);

export function CartTable({
  lines,
  catalogByItemId,
  focusLineId,
  onFocusHandled,
  onQtyChange,
  onLooseChange,
  onBasisChange,
  wholesaleBillingEnabled,
  onQtyEnter,
  onDiscountChange,
  onOverrideBatch,
  onRemove,
  schemeByLineId,
}: {
  lines: CartLine[];
  catalogByItemId: Map<string, PosItem>;
  focusLineId: string | null;
  onFocusHandled: () => void;
  onQtyChange: (lineId: string, qty: number) => void;
  onLooseChange: (lineId: string, isLoose: boolean) => void;
  onBasisChange: (lineId: string, basis: "mrp" | "ptr") => void;
  wholesaleBillingEnabled: boolean;
  onQtyEnter: () => void;
  onDiscountChange: (lineId: string, percent: number) => void;
  onOverrideBatch: (lineId: string, batchId: string) => void;
  onRemove: (lineId: string) => void;
  schemeByLineId: Map<string, SchemeApplication>;
}) {
  const qtyRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (focusLineId) {
      const el = qtyRefs.current.get(focusLineId);
      if (el) {
        el.focus();
        el.select();
      }
      onFocusHandled();
    }
  }, [focusLineId, onFocusHandled]);

  if (lines.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Search for an item above to start a sale.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Item</th>
            <th className="px-3 py-2 text-left font-medium">Batch / Expiry</th>
            <th className="w-20 px-3 py-2 text-right font-medium">Qty</th>
            <th className="w-24 px-3 py-2 text-right font-medium">MRP</th>
            <th className="w-24 px-3 py-2 text-right font-medium">Rate</th>
            <th className="w-24 px-3 py-2 text-right font-medium">Disc %</th>
            <th className="w-20 px-3 py-2 text-right font-medium">Tax %</th>
            <th className="w-28 px-3 py-2 text-right font-medium">Total</th>
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const catalogItem = catalogByItemId.get(line.itemId);
            const otherBatches = catalogItem?.batches ?? [];
            const baseRate =
              wholesaleBillingEnabled && line.priceBasis === "ptr" && line.ptr
                ? line.ptr
                : line.rate;
            const effectiveRate = line.isLooseSale
              ? looseUnitRate(baseRate, line.unitsPerPack)
              : baseRate;
            const grossBeforeTax =
              line.qty * effectiveRate * (1 - line.discountPercent / 100);
            // A loose line can draw on every unit on the shelf, opened pack
            // included; a pack line only on unopened packs.
            const maxQty = line.isLooseSale
              ? line.availableQty * line.unitsPerPack + line.looseUnits
              : line.availableQty;
            const canSellLoose = line.unitsPerPack > 1 && looseAllowedByItem(catalogItem);
            // Only offered where there is a PTR to switch to — a toggle
            // that silently does nothing is worse than no toggle.
            const canSellWholesale =
              wholesaleBillingEnabled && line.ptr !== null && line.ptr > 0;
            const lineTotal = grossBeforeTax * (1 + line.taxRate / 100);
            const expired = new Date(line.expiryDate) < new Date();

            return (
              <tr key={line.lineId} className="border-b last:border-0">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium">{line.itemName}</div>
                  {line.genericName && (
                    <div className="text-xs text-muted-foreground">{line.genericName}</div>
                  )}
                  {line.scheduleClass !== "none" && (
                    <Badge variant="outline" className="mt-0.5 text-[10px]">
                      Schedule {line.scheduleClass}
                    </Badge>
                  )}
                  {schemeByLineId.get(line.lineId) && (
                    <Badge className="mt-0.5 block w-fit bg-success/15 text-[10px] text-success hover:bg-success/15">
                      {schemeByLineId.get(line.lineId)!.reason}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  {otherBatches.length > 1 ? (
                    <select
                      value={line.batchId}
                      onChange={(e) => onOverrideBatch(line.lineId, e.target.value)}
                      className="rounded-md border bg-transparent px-1.5 py-1 text-xs"
                    >
                      {otherBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batchNo} · exp {format(new Date(b.expiryDate), "MMM yyyy")} · qty{" "}
                          {b.currentQty}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={cn("text-xs", expired && "text-destructive")}>
                      {line.batchNo} · exp {format(new Date(line.expiryDate), "MMM yyyy")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    ref={(el) => {
                      if (el) qtyRefs.current.set(line.lineId, el);
                      else qtyRefs.current.delete(line.lineId);
                    }}
                    type="number"
                    min={1}
                    max={maxQty}
                    value={line.qty}
                    onChange={(e) => onQtyChange(line.lineId, Number(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onQtyEnter();
                      }
                    }}
                    className="h-8 text-right tabular-nums"
                  />
                  {canSellLoose && (
                    <div className="mt-1 flex overflow-hidden rounded-md border text-[10px]">
                      <button
                        type="button"
                        className={cn(
                          "flex-1 px-1.5 py-0.5",
                          !line.isLooseSale ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                        onClick={() => onLooseChange(line.lineId, false)}
                      >
                        Pack
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex-1 px-1.5 py-0.5",
                          line.isLooseSale ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                        onClick={() => onLooseChange(line.lineId, true)}
                      >
                        Loose
                      </button>
                    </div>
                  )}
                  {canSellWholesale && (
                    <div className="mt-1 flex overflow-hidden rounded-md border text-[10px]">
                      <button
                        type="button"
                        className={cn(
                          "flex-1 px-1.5 py-0.5",
                          line.priceBasis === "mrp"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                        onClick={() => onBasisChange(line.lineId, "mrp")}
                      >
                        Retail
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex-1 px-1.5 py-0.5",
                          line.priceBasis === "ptr"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                        onClick={() => onBasisChange(line.lineId, "ptr")}
                      >
                        PTR
                      </button>
                    </div>
                  )}
                  {line.isLooseSale && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      ₹{effectiveRate.toFixed(2)} each · {maxQty} available
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">
                  ₹{line.mrp.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right align-top tabular-nums">
                  ₹{line.rate.toFixed(2)}
                </td>
                <td className="px-3 py-2 align-top">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={line.discountPercent}
                    onChange={(e) => onDiscountChange(line.lineId, Number(e.target.value))}
                    className="h-8 text-right tabular-nums"
                  />
                  {canSellLoose && (
                    <div className="mt-1 flex overflow-hidden rounded-md border text-[10px]">
                      <button
                        type="button"
                        className={cn(
                          "flex-1 px-1.5 py-0.5",
                          !line.isLooseSale ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                        onClick={() => onLooseChange(line.lineId, false)}
                      >
                        Pack
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex-1 px-1.5 py-0.5",
                          line.isLooseSale ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                        onClick={() => onLooseChange(line.lineId, true)}
                      >
                        Loose
                      </button>
                    </div>
                  )}
                  {canSellWholesale && (
                    <div className="mt-1 flex overflow-hidden rounded-md border text-[10px]">
                      <button
                        type="button"
                        className={cn(
                          "flex-1 px-1.5 py-0.5",
                          line.priceBasis === "mrp"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                        onClick={() => onBasisChange(line.lineId, "mrp")}
                      >
                        Retail
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex-1 px-1.5 py-0.5",
                          line.priceBasis === "ptr"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                        onClick={() => onBasisChange(line.lineId, "ptr")}
                      >
                        PTR
                      </button>
                    </div>
                  )}
                  {line.isLooseSale && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      ₹{effectiveRate.toFixed(2)} each · {maxQty} available
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">
                  {line.taxRate}%
                </td>
                <td className="px-3 py-2 text-right align-top font-medium tabular-nums">
                  ₹{lineTotal.toFixed(2)}
                </td>
                <td className="px-2 py-2 align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemove(line.lineId)}
                    aria-label={`Remove ${line.itemName}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
