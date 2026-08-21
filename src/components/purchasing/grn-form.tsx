"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { ItemCombobox, type PurchasableItem } from "@/components/purchasing/item-combobox";
import { createGrn } from "@/lib/actions/grn";
import { AttachmentUpload } from "@/components/attachment-upload";
import { readPurchaseInvoicePhoto, type ScannedGrn } from "@/lib/actions/vision";
import { GrnInvoiceImportDialog, type ReviewRow } from "./grn-invoice-import-dialog";
import { listOpenPurchaseOrdersForSupplier } from "@/lib/actions/purchase-orders";
import type { PlainSupplier } from "@/lib/serialize";
import { Loader2, Pencil, Sparkles, Trash2, TriangleAlert } from "lucide-react";

type DraftRow = {
  key: string;
  item: PurchasableItem;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  mrp: string;
  /** Price To Retailer. Empty for stock only sold retail. */
  ptr: string;
  rate: string;
  qty: string;
};

function rowWarnings(row: DraftRow): string[] {
  const warnings: string[] = [];
  if (row.expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(row.expiryDate) < today) warnings.push("Already expired");
  }
  if (row.mrp && row.rate && Number(row.mrp) < Number(row.rate)) {
    warnings.push("MRP below rate");
  }
  return warnings;
}

export function GrnForm({
  suppliers,
  items,
  wholesaleBillingEnabled = false,
}: {
  suppliers: PlainSupplier[];
  items: PurchasableItem[];
  /** When off, no PTR field appears — see the wholesale setting. */
  wholesaleBillingEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState(searchParams.get("supplierId") ?? "");
  const [purchaseOrderId, setPurchaseOrderId] = useState(searchParams.get("poId") ?? "");
  // Frozen at mount: if the page was opened via a specific PO's "Create GRN"
  // link, that PO must always appear as a real dropdown option even once
  // its status moves past draft/sent — otherwise the pre-filled selection
  // silently renders as "No PO" (see listOpenPurchaseOrdersForSupplier).
  const [initialPoId] = useState(() => searchParams.get("poId") ?? "");
  const [openPos, setOpenPos] = useState<
    { id: string; status: string; createdAt: string; itemCount: number }[]
  >([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceImagePath, setInvoiceImagePath] = useState<string | null>(null);
  const [scan, setScan] = useState<ScannedGrn | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanning, startScanning] = useTransition();

  function scanInvoice() {
    if (!invoiceImagePath) return;
    startScanning(async () => {
      const result = await readPurchaseInvoicePhoto(invoiceImagePath);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // Header fields fill only blanks — a number already typed off the
      // paper invoice beats one read off a photo of it.
      if (result.fields.invoiceNo && !invoiceNo) setInvoiceNo(result.fields.invoiceNo);
      if (result.fields.invoiceDate && !invoiceDate) setInvoiceDate(result.fields.invoiceDate);
      setScan(result.fields);
      setReviewOpen(true);
    });
  }

  // Rows arrive already reviewed; they still land in the same editable draft
  // table as hand-keyed rows and are saved by the same code path.
  function addReviewedRows(reviewed: ReviewRow[]) {
    setRows((prev) => [
      ...prev,
      ...reviewed.map((r) => ({
        key: crypto.randomUUID(),
        item: r.item!,
        batchNo: r.batchNo.trim(),
        mfgDate: r.mfgDate,
        expiryDate: r.expiryDate,
        mrp: r.mrp,
        // Photo-reviewed rows carry no PTR — a distributor invoice states
        // it, but the extractor does not read it yet.
        ptr: "",
        rate: r.rate || "0",
        qty: r.qty,
      })),
    ]);
    setReviewOpen(false);
    toast.success(`Added ${reviewed.length} row${reviewed.length === 1 ? "" : "s"} — review before saving`);
  }

  const [rows, setRows] = useState<DraftRow[]>([]);

  const prefillItemId = searchParams.get("itemId");
  const [selectedItem, setSelectedItem] = useState<PurchasableItem | null>(
    prefillItemId ? (items.find((i) => i.id === prefillItemId) ?? null) : null
  );
  const [batchNo, setBatchNo] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [mrp, setMrp] = useState("");
  const [ptr, setPtr] = useState("");
  const [rate, setRate] = useState("");
  const [qty, setQty] = useState("");

  const itemRef = useRef<HTMLInputElement>(null);
  const batchNoRef = useRef<HTMLInputElement>(null);
  const mfgDateRef = useRef<HTMLInputElement>(null);
  const expiryDateRef = useRef<HTMLInputElement>(null);
  const mrpRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prefillItemId && selectedItem) {
      requestAnimationFrame(() => batchNoRef.current?.focus());
    }
    // Only meant to run once on mount for the prefill case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear the stale PO list synchronously when the supplier changes, rather
  // than in the effect body below (see search-panel.tsx for the same
  // render-time-adjustment pattern, used to satisfy set-state-in-effect).
  const [prevSupplierId, setPrevSupplierId] = useState(supplierId);
  if (supplierId !== prevSupplierId) {
    setPrevSupplierId(supplierId);
    setOpenPos([]);
  }

  useEffect(() => {
    if (!supplierId) return;
    listOpenPurchaseOrdersForSupplier(supplierId, initialPoId || undefined).then((pos) =>
      setOpenPos(
        pos.map((p) => ({
          id: p.id,
          status: p.status,
          createdAt: p.createdAt.toString(),
          itemCount: p.itemCount,
        }))
      )
    );
  }, [supplierId, initialPoId]);

  // The item combobox swaps its own <input> for a non-input "locked" pill
  // once an item is selected, and back again once cleared — so its ref can
  // be null for a render or two after a state change. Every other row field
  // below is a plain, always-mounted <input>, so those get focused
  // synchronously; only this one needs to wait a frame for the swap.
  function focusItemInput() {
    requestAnimationFrame(() => itemRef.current?.focus());
  }

  function commitRow() {
    if (!selectedItem) {
      toast.error("Select an item");
      itemRef.current?.focus();
      return;
    }
    if (!batchNo.trim()) {
      toast.error("Enter a batch number");
      batchNoRef.current?.focus();
      return;
    }
    if (!expiryDate) {
      toast.error("Enter an expiry date");
      expiryDateRef.current?.focus();
      return;
    }
    if (!mrp || Number(mrp) <= 0) {
      toast.error("Enter an MRP greater than 0");
      mrpRef.current?.focus();
      return;
    }
    if (!qty || Number(qty) <= 0) {
      toast.error("Enter a qty greater than 0");
      qtyRef.current?.focus();
      return;
    }

    setRows((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        item: selectedItem,
        batchNo: batchNo.trim(),
        mfgDate,
        expiryDate,
        mrp,
        ptr,
        rate: rate || "0",
        qty,
      },
    ]);

    // Carry forward mfg/expiry/MRP/rate — a distributor invoice often
    // repeats these across several consecutive lines. Item, batch no. and
    // qty almost always differ per line, so those clear.
    setSelectedItem(null);
    setBatchNo("");
    setQty("");
    focusItemInput();
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function editRow(row: DraftRow) {
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    setSelectedItem(row.item);
    setBatchNo(row.batchNo);
    setMfgDate(row.mfgDate);
    setExpiryDate(row.expiryDate);
    setMrp(row.mrp);
    setPtr(row.ptr ?? "");
    setRate(row.rate);
    setQty(row.qty);
    batchNoRef.current?.focus();
  }

  const total = rows.reduce((sum, r) => sum + Number(r.qty) * Number(r.rate), 0);
  const [variance, setVariance] = useState<{
    net: number;
    lines: { kind: string; message: string }[];
  } | null>(null);

  function save(acknowledgeVariance = false) {
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    if (!invoiceNo.trim()) {
      toast.error("Enter the supplier's invoice number");
      return;
    }
    if (!invoiceDate) {
      toast.error("Enter the supplier's invoice date");
      return;
    }
    if (rows.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    startTransition(async () => {
      try {
        const created = await createGrn({
          supplierId,
          purchaseOrderId: purchaseOrderId || undefined,
          supplierInvoiceNo: invoiceNo.trim(),
          supplierInvoiceDate: invoiceDate,
          invoiceImagePath: invoiceImagePath ?? undefined,
          items: rows.map((r) => ({
            itemId: r.item.id,
            batchNo: r.batchNo,
            mfgDate: r.mfgDate || undefined,
            expiryDate: r.expiryDate,
            mrp: Number(r.mrp),
            // Blank means "no PTR", not zero.
            ptr: r.ptr ? Number(r.ptr) : undefined,
            rate: Number(r.rate),
            qty: Number(r.qty),
          })),
          acknowledgeVariance,
        });
        toast.success("GRN saved — stock updated");
        router.push(`/grn/${created.id}`);
        router.refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Something went wrong";
        // The receipt costs more than the purchase order agreed. Shown
        // before it is booked, because afterwards the stock is in and the
        // payable is owed.
        if (message.startsWith("PURCHASE_VARIANCE:")) {
          try {
            setVariance(JSON.parse(message.slice("PURCHASE_VARIANCE:".length)));
            return;
          } catch {
            // Fall through to the plain error if it cannot be parsed.
          }
        }
        toast.error(message);
      }
    });
  }

  function onSave() {
    setVariance(null);
    save(false);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <Select
            value={supplierId}
            onValueChange={(v) => {
              setSupplierId(v);
              setPurchaseOrderId("");
            }}
          >
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
        <div className="space-y-1.5">
          <Label>Purchase order (optional)</Label>
          <Select
            value={purchaseOrderId || "none"}
            onValueChange={(v) => setPurchaseOrderId(v === "none" ? "" : v)}
            disabled={!supplierId}
          >
            <SelectTrigger>
              <SelectValue placeholder="No PO" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No PO — direct receipt</SelectItem>
              {openPos.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.itemCount} item{po.itemCount === 1 ? "" : "s"} ·{" "}
                  {new Date(po.createdAt).toLocaleDateString()}
                  {po.status !== "draft" && po.status !== "sent" && ` · ${po.status}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoiceNo">Supplier invoice no.</Label>
          <Input id="invoiceNo" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoiceDate">Supplier invoice date</Label>
          <Input
            id="invoiceDate"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <AttachmentUpload
            label="Invoice photo (optional)"
            endpoint="/api/uploads/purchase-invoice"
            path={invoiceImagePath}
            onPathChange={(p) => {
              setInvoiceImagePath(p);
              setScan(null);
            }}
            buttonLabel="Attach bill"
            previewAlt="Supplier invoice preview"
          />
          {invoiceImagePath && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={scanning}
              onClick={scanInvoice}
            >
              {scanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Read items from bill
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Items received</Label>
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="w-60 space-y-1">
            <Label className="text-xs text-muted-foreground">Item</Label>
            <ItemCombobox
              items={items}
              selectedItem={selectedItem}
              onSelect={(item) => {
                setSelectedItem(item);
                batchNoRef.current?.focus();
              }}
              onClear={() => setSelectedItem(null)}
              inputRef={itemRef}
            />
          </div>
          {wholesaleBillingEnabled && (
            <div className="space-y-1">
              <Label htmlFor="grnPtr" className="text-xs text-muted-foreground">
                PTR
              </Label>
              <Input
                id="grnPtr"
                type="number"
                step="0.01"
                value={ptr}
                placeholder="optional"
                onChange={(e) => setPtr(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </div>
          )}
          <div className="w-32 space-y-1">
            <Label htmlFor="grnBatchNo" className="text-xs text-muted-foreground">
              Batch no.
            </Label>
            <Input
              id="grnBatchNo"
              ref={batchNoRef}
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  mfgDateRef.current?.focus();
                }
              }}
            />
          </div>
          <div className="w-36 space-y-1">
            <Label htmlFor="grnMfgDate" className="text-xs text-muted-foreground">
              Mfg date
            </Label>
            <Input
              id="grnMfgDate"
              ref={mfgDateRef}
              type="date"
              value={mfgDate}
              onChange={(e) => setMfgDate(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  expiryDateRef.current?.focus();
                }
              }}
            />
          </div>
          <div className="w-36 space-y-1">
            <Label htmlFor="grnExpiryDate" className="text-xs text-muted-foreground">
              Expiry date
            </Label>
            <Input
              id="grnExpiryDate"
              ref={expiryDateRef}
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  mrpRef.current?.focus();
                }
              }}
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="grnMrp" className="text-xs text-muted-foreground">
              MRP
            </Label>
            <Input
              id="grnMrp"
              ref={mrpRef}
              type="number"
              step="0.01"
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  rateRef.current?.focus();
                }
              }}
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="grnRate" className="text-xs text-muted-foreground">
              Rate
            </Label>
            <Input
              id="grnRate"
              ref={rateRef}
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  qtyRef.current?.focus();
                }
              }}
            />
          </div>
          <div className="w-20 space-y-1">
            <Label htmlFor="grnQty" className="text-xs text-muted-foreground">
              Qty
            </Label>
            <Input
              id="grnQty"
              ref={qtyRef}
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
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
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((r) => {
                  const warnings = rowWarnings(r);
                  return (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.item.name}</TableCell>
                      <TableCell>{r.batchNo}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{r.expiryDate}</TableCell>
                      <TableCell className="text-right tabular-nums">₹{Number(r.mrp).toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₹{Number(r.rate).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₹{(Number(r.qty) * Number(r.rate)).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {warnings.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {warnings.map((w) => (
                              <Badge
                                key={w}
                                className="gap-1 bg-warning/20 text-warning-foreground hover:bg-warning/20"
                              >
                                <TriangleAlert className="h-3 w-3" /> {w}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editRow(r)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Edit row"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(r.key)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-16 text-center text-muted-foreground">
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

      {variance && (
        <div className="space-y-3 rounded-lg border border-warning/50 bg-warning/10 p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-warning-foreground">
                This invoice does not match the purchase order.
              </p>
              <p className="text-sm text-warning-foreground">
                {variance.net > 0
                  ? `It costs ₹${variance.net.toFixed(2)} more than the order agreed.`
                  : variance.net < 0
                    ? `It costs ₹${Math.abs(variance.net).toFixed(2)} less than the order agreed.`
                    : "The quantities differ from the order."}
              </p>
            </div>
          </div>
          <ul className="space-y-1 pl-6 text-sm text-warning-foreground">
            {variance.lines.map((l, i) => (
              <li key={i} className="list-disc">
                {l.message}
              </li>
            ))}
          </ul>
          <p className="pl-6 text-xs text-warning-foreground/80">
            Check the distributor&apos;s invoice before receiving. If the difference is genuine,
            receive it anyway — the difference is recorded against this GRN either way.
          </p>
          <div className="flex gap-2 pl-6">
            <Button size="sm" variant="outline" onClick={() => save(true)} disabled={pending}>
              Receive it anyway
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setVariance(null)} disabled={pending}>
              Go back and check
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={pending}>
          Save GRN
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <GrnInvoiceImportDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        scan={scan}
        items={items}
        onAdd={addReviewedRows}
      />
    </div>
  );
}
