"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ItemCombobox, type PurchasableItem } from "@/components/purchasing/item-combobox";
import { createPurchaseReturn } from "@/lib/actions/purchase-returns";
import type { PlainSupplier, PlainBatch } from "@/lib/serialize";
import { Trash2 } from "lucide-react";

type ReturnableItem = PurchasableItem & { batches: PlainBatch[] };

type DraftRow = {
  key: string;
  item: ReturnableItem;
  batch: PlainBatch;
  qty: string;
  rate: string;
};

export function PurchaseReturnForm({
  suppliers,
  items,
}: {
  suppliers: PlainSupplier[];
  items: ReturnableItem[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState(searchParams.get("supplierId") ?? "");
  const grnId = searchParams.get("grnId") ?? "";
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);

  const [selectedItem, setSelectedItem] = useState<ReturnableItem | null>(null);
  const [batchId, setBatchId] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");

  const itemRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);

  const availableBatches = (selectedItem?.batches ?? []).filter((b) => b.currentQty > 0);
  const selectedBatch = availableBatches.find((b) => b.id === batchId) ?? null;

  function resetEntryBar() {
    setSelectedItem(null);
    setBatchId("");
    setQty("");
    setRate("");
    requestAnimationFrame(() => itemRef.current?.focus());
  }

  function commitRow() {
    if (!selectedItem) {
      toast.error("Select an item");
      itemRef.current?.focus();
      return;
    }
    if (!selectedBatch) {
      toast.error("Select a batch");
      return;
    }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) {
      toast.error("Enter a qty greater than 0");
      qtyRef.current?.focus();
      return;
    }
    if (qtyNum > selectedBatch.currentQty) {
      toast.error(`Only ${selectedBatch.currentQty} in stock for this batch`);
      qtyRef.current?.focus();
      return;
    }

    setRows((prev) => [
      ...prev,
      { key: crypto.randomUUID(), item: selectedItem, batch: selectedBatch, qty, rate: rate || "0" },
    ]);
    resetEntryBar();
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const total = rows.reduce((sum, r) => sum + Number(r.qty) * Number(r.rate), 0);

  function onSave() {
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    if (rows.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createPurchaseReturn({
          supplierId,
          grnId: grnId || undefined,
          reason: reason.trim() || undefined,
          items: rows.map((r) => ({
            itemId: r.item.id,
            batchId: r.batch.id,
            qty: Number(r.qty),
            rate: Number(r.rate),
          })),
        });
        toast.success("Purchase return saved — stock updated");
        router.push(`/purchase-returns/${created.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="reason">Reason (optional)</Label>
          <Input
            id="reason"
            placeholder="e.g. Damaged in transit, wrong item shipped…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Items to return</Label>
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="w-60 space-y-1">
            <Label className="text-xs text-muted-foreground">Item</Label>
            <ItemCombobox
              items={items}
              selectedItem={selectedItem}
              onSelect={(item) => {
                const returnable = items.find((i) => i.id === item.id) ?? null;
                setSelectedItem(returnable);
                const firstBatch = returnable?.batches.find((b) => b.currentQty > 0);
                setBatchId(firstBatch?.id ?? "");
                setRate(firstBatch ? String(firstBatch.purchaseRate) : "");
              }}
              onClear={() => {
                setSelectedItem(null);
                setBatchId("");
              }}
              inputRef={itemRef}
            />
          </div>
          <div className="w-48 space-y-1">
            <Label htmlFor="returnBatch" className="text-xs text-muted-foreground">
              Batch
            </Label>
            <Select
              value={batchId}
              onValueChange={(v) => {
                setBatchId(v);
                const b = availableBatches.find((x) => x.id === v);
                if (b) setRate(String(b.purchaseRate));
              }}
              disabled={!selectedItem}
            >
              <SelectTrigger id="returnBatch">
                <SelectValue placeholder="Select batch" />
              </SelectTrigger>
              <SelectContent>
                {availableBatches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.batchNo} · {b.currentQty} in stock
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="returnQty" className="text-xs text-muted-foreground">
              Qty
            </Label>
            <Input
              id="returnQty"
              ref={qtyRef}
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  rateRef.current?.focus();
                }
              }}
            />
          </div>
          <div className="w-28 space-y-1">
            <Label htmlFor="returnRate" className="text-xs text-muted-foreground">
              Rate
            </Label>
            <Input
              id="returnRate"
              ref={rateRef}
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRow();
                }
              }}
            />
          </div>
          <Button type="button" onClick={commitRow}>
            Add row
          </Button>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.item.name}</TableCell>
                    <TableCell>{r.batch.batchNo}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(r.batch.expiryDate), "MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{Number(r.rate).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₹{(Number(r.qty) * Number(r.rate)).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                    No items added yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {rows.length > 0 && (
          <div className="text-right text-sm text-muted-foreground">
            Total: <span className="font-medium text-foreground">₹{total.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={pending}>
          Save purchase return
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
