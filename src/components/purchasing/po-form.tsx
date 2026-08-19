"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { createPurchaseOrder } from "@/lib/actions/purchase-orders";
import { AttachmentUpload } from "@/components/attachment-upload";
import type { PlainSupplier } from "@/lib/serialize";
import { Trash2 } from "lucide-react";

type DraftRow = { key: string; item: PurchasableItem; qty: string; rate: string };

export function PoForm({
  suppliers,
  items,
}: {
  suppliers: PlainSupplier[];
  items: PurchasableItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);

  const [selectedItem, setSelectedItem] = useState<PurchasableItem | null>(null);
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [documentImagePath, setDocumentImagePath] = useState<string | null>(null);

  const itemRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);

  function resetEntryBar() {
    setSelectedItem(null);
    setQty("");
    setRate("");
    requestAnimationFrame(() => itemRef.current?.focus());
  }

  function commitRow() {
    if (!selectedItem) {
      itemRef.current?.focus();
      return;
    }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) {
      toast.error("Enter a quantity greater than 0");
      qtyRef.current?.focus();
      return;
    }
    setRows((prev) => [
      ...prev,
      { key: crypto.randomUUID(), item: selectedItem, qty, rate: rate || "0" },
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
        const created = await createPurchaseOrder({
          supplierId,
          documentImagePath: documentImagePath ?? undefined,
          items: rows.map((r) => ({ itemId: r.item.id, qty: Number(r.qty), rate: Number(r.rate) })),
        });
        toast.success("Purchase order created");
        router.push(`/purchase-orders/${created.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start gap-6">
        <div className="w-full max-w-xs space-y-1.5">
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
        {/* A distributor quotation or a photographed order sheet — the
            document this order was keyed in from. */}
        <AttachmentUpload
          label="Quotation / order photo (optional)"
          endpoint="/api/uploads/purchase-invoice"
          path={documentImagePath}
          onPathChange={setDocumentImagePath}
          buttonLabel="Attach photo"
          previewAlt="Purchase order document preview"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Items</Label>
        <div className="flex items-end gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="w-72 space-y-1">
            <Label className="text-xs text-muted-foreground">Item</Label>
            <ItemCombobox
              items={items}
              selectedItem={selectedItem}
              onSelect={(item) => {
                setSelectedItem(item);
                qtyRef.current?.focus();
              }}
              onClear={() => setSelectedItem(null)}
              inputRef={itemRef}
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="poQty" className="text-xs text-muted-foreground">
              Qty
            </Label>
            <Input
              id="poQty"
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
            <Label htmlFor="poRate" className="text-xs text-muted-foreground">
              Rate
            </Label>
            <Input
              id="poRate"
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
                  <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
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
          Save purchase order
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
