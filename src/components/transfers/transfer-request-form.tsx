"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBranchStock, createStockTransferRequest } from "@/lib/actions/stock-transfers";
import type { PlainItem, PlainBatch } from "@/lib/serialize";
import { Trash2 } from "lucide-react";

type StockItem = PlainItem & { batches: PlainBatch[] };

interface Row {
  itemId: string;
  itemName: string;
  batchId: string;
  batchNo: string;
  availableQty: number;
  qty: number;
}

export function TransferRequestForm({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [fromBranchId, setFromBranchId] = useState("");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loadingStock, startLoadingStock] = useTransition();

  const [itemId, setItemId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [qty, setQty] = useState("1");
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, startSubmitting] = useTransition();

  function handleFromBranchChange(value: string) {
    setFromBranchId(value);
    setItemId("");
    setBatchId("");
    setRows([]);
    setStock([]);
    startLoadingStock(async () => {
      try {
        const data = await getBranchStock(value);
        setStock(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load branch stock");
      }
    });
  }

  const selectedItem = stock.find((i) => i.id === itemId);
  const selectedBatch = selectedItem?.batches.find((b) => b.id === batchId);

  function addRow() {
    if (!selectedItem || !selectedBatch) return;
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) return;
    if (qtyNum > selectedBatch.currentQty) {
      toast.error(`Only ${selectedBatch.currentQty} available in that batch.`);
      return;
    }
    setRows((r) => [
      ...r,
      {
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        batchId: selectedBatch.id,
        batchNo: selectedBatch.batchNo,
        availableQty: selectedBatch.currentQty,
        qty: qtyNum,
      },
    ]);
    setItemId("");
    setBatchId("");
    setQty("1");
  }

  function removeRow(batchId: string) {
    setRows((r) => r.filter((row) => row.batchId !== batchId));
  }

  function submit() {
    if (!fromBranchId || rows.length === 0) return;
    startSubmitting(async () => {
      try {
        await createStockTransferRequest({
          fromBranchId,
          items: rows.map((r) => ({ itemId: r.itemId, batchId: r.batchId, qty: r.qty })),
        });
        toast.success("Transfer requested");
        router.push("/transfers");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not request transfer");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="max-w-xs space-y-1.5">
        <Label>Request stock from</Label>
        <Select value={fromBranchId} onValueChange={handleFromBranchChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select source branch" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {fromBranchId && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Item</Label>
              <Select
                value={itemId}
                onValueChange={(v) => {
                  setItemId(v);
                  setBatchId("");
                }}
                disabled={loadingStock}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingStock ? "Loading…" : "Select item"} />
                </SelectTrigger>
                <SelectContent>
                  {stock.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Batch</Label>
              <Select value={batchId} onValueChange={setBatchId} disabled={!selectedItem}>
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {selectedItem?.batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batchNo} ({b.currentQty} available)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Qty</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={addRow} disabled={!selectedBatch}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.batchId}>
                  <TableCell className="font-medium">{r.itemName}</TableCell>
                  <TableCell>{r.batchNo}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                  <TableCell>
                    <Button size="icon-sm" variant="ghost" onClick={() => removeRow(r.batchId)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                  No items added yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-2">
        <Button disabled={submitting || rows.length === 0} onClick={submit}>
          Request transfer
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
