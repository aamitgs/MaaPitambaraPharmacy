"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ItemCombobox, type PurchasableItem } from "./item-combobox";
import { TriangleAlert } from "lucide-react";
import type { ScannedGrn, ScannedGrnLine } from "@/lib/actions/vision";

/**
 * Review step between a scanned invoice and the GRN draft. Every scanned
 * line is shown with its parsed values editable and its matched item
 * confirmable — nothing reaches the GRN (and therefore stock) until a
 * person presses Add. Lines the matcher wasn't confident about start blank
 * so they can't be added by momentum.
 */
export type ReviewRow = ScannedGrnLine & { item: PurchasableItem | null };

export function GrnInvoiceImportDialog({
  open,
  onOpenChange,
  scan,
  items,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scan: ScannedGrn | null;
  items: PurchasableItem[];
  onAdd: (rows: ReviewRow[]) => void;
}) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  // The combobox owns keyboard focus via a ref; these rows are reviewed with
  // the mouse, so one shared throwaway ref is enough.
  const comboRef = useRef<HTMLInputElement>(null!);
  const [seeded, setSeeded] = useState<ScannedGrn | null>(null);

  // Seed from the scan the first time this dialog sees it, without an
  // effect: re-seeding on every render would wipe the user's corrections.
  if (scan && scan !== seeded) {
    setSeeded(scan);
    setRows(
      scan.lines.map((line) => ({
        ...line,
        item: line.matchedItemId
          ? (items.find((i) => i.id === line.matchedItemId) ?? null)
          : null,
      }))
    );
  }

  function update(index: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const ready = rows.filter((r) => r.item && r.batchNo.trim() && r.expiryDate && Number(r.qty) > 0);
  const incomplete = rows.length - ready.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review scanned invoice</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Read from the photo — check every line against the paper invoice before adding.
          Batch number, expiry and quantity are required; a line missing any of them is
          skipped.
        </p>

        <div className="space-y-3">
          {rows.map((row, i) => {
            const uncertain = row.matchScore > 0 && row.matchScore < 0.8;
            return (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Printed: <span className="font-mono">{row.description}</span>
                  </div>
                  {!row.item && (
                    <span className="flex items-center gap-1 text-xs text-warning-foreground">
                      <TriangleAlert className="h-3.5 w-3.5" /> pick an item
                    </span>
                  )}
                  {row.item && uncertain && (
                    <span className="flex items-center gap-1 text-xs text-warning-foreground">
                      <TriangleAlert className="h-3.5 w-3.5" /> uncertain match
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs text-muted-foreground">Item</Label>
                    <ItemCombobox
                      items={items}
                      selectedItem={row.item}
                      onSelect={(item) => update(i, { item })}
                      onClear={() => update(i, { item: null })}
                      inputRef={comboRef}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">Batch no.</Label>
                    <Input
                      className="h-8"
                      value={row.batchNo}
                      onChange={(e) => update(i, { batchNo: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">Expiry</Label>
                    <Input
                      className="h-8"
                      type="date"
                      value={row.expiryDate}
                      onChange={(e) => update(i, { expiryDate: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">MRP</Label>
                    <Input
                      className="h-8"
                      value={row.mrp}
                      onChange={(e) => update(i, { mrp: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">Rate</Label>
                    <Input
                      className="h-8"
                      value={row.rate}
                      onChange={(e) => update(i, { rate: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Qty</Label>
                    <Input
                      className="h-8"
                      value={row.qty}
                      onChange={(e) => update(i, { qty: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No product lines were read from that photo.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {ready.length} of {rows.length} ready
            {incomplete > 0 ? ` · ${incomplete} incomplete and will be skipped` : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={ready.length === 0} onClick={() => onAdd(ready)}>
              Add {ready.length} row{ready.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
