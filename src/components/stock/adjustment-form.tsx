"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createStockAdjustment } from "@/lib/actions/stock-adjustments";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Batch = {
  id: string;
  itemName: string;
  unit: string;
  batchNo: string;
  expiryDate: string;
  isExpired: boolean;
  currentQty: number;
  purchaseRate: number;
};

const REASONS = [
  { value: "expired", label: "Expired — destroyed", sign: -1 },
  { value: "damaged", label: "Damaged or spoiled", sign: -1 },
  { value: "lost", label: "Missing at count", sign: -1 },
  { value: "sample", label: "Given as a sample", sign: -1 },
  { value: "found", label: "Found at count", sign: 1 },
  { value: "recount", label: "Correction after a count", sign: 0 },
] as const;

export function AdjustmentForm({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<string>("expired");
  const [note, setNote] = useState("");
  const [disposalRef, setDisposalRef] = useState("");
  const [lines, setLines] = useState<{ batchId: string; qty: string }[]>([]);
  const [picker, setPicker] = useState("");

  const byId = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const sign = REASONS.find((r) => r.value === reason)?.sign ?? -1;
  const expiredCount = batches.filter((b) => b.isExpired).length;

  const value = lines.reduce((sum, l) => {
    const b = byId.get(l.batchId);
    return sum + (b ? Math.abs(Number(l.qty) || 0) * b.purchaseRate : 0);
  }, 0);

  function addAllExpired() {
    const existing = new Set(lines.map((l) => l.batchId));
    const added = batches
      .filter((b) => b.isExpired && !existing.has(b.id))
      .map((b) => ({ batchId: b.id, qty: String(b.currentQty) }));
    if (added.length === 0) {
      toast.info("Every expired batch is already on the list");
      return;
    }
    setLines((l) => [...l, ...added]);
  }

  function submit() {
    startTransition(async () => {
      try {
        const result = await createStockAdjustment({
          reason: reason as "expired",
          note: note || undefined,
          disposalRef: disposalRef || undefined,
          items: lines
            .filter((l) => l.batchId && Number(l.qty) > 0)
            .map((l) => ({
              batchId: l.batchId,
              // The form asks for a plain quantity; the reason decides the
              // direction, so a user can never write stock off by typing a
              // minus sign they did not mean.
              qtyChange: (sign === 0 ? -1 : sign) * Math.abs(Number(l.qty)),
            })),
        });
        toast.success(`Recorded ${result.adjustmentNo}`);
        router.push("/stock-adjustments");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not record the adjustment");
      }
    });
  }

  return (
    <div className="max-w-4xl space-y-5 p-6">
      <div>
        <h1 className="text-lg font-semibold">New stock adjustment</h1>
        <p className="text-sm text-muted-foreground">
          Takes stock off the books — or puts it back — outside a sale or a purchase. Recorded
          permanently: a mistake is corrected with a second, opposite adjustment.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {reason === "expired" && (
          <div className="space-y-1.5">
            <Label htmlFor="disposal">Disposal reference</Label>
            <Input
              id="disposal"
              value={disposalRef}
              onChange={(e) => setDisposalRef(e.target.value)}
              placeholder="Destruction certificate / witness record"
            />
            <p className="text-[11px] text-muted-foreground">
              Required — it is what shows the stock was destroyed, not diverted.
            </p>
          </div>
        )}
      </div>

      {reason === "expired" && expiredCount > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {expiredCount} batch{expiredCount === 1 ? " is" : "es are"} past expiry
          </AlertTitle>
          <AlertDescription>
            <Button size="sm" variant="outline" className="mt-2" onClick={addAllExpired}>
              Add all expired batches
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Batches</Label>
        <div className="flex gap-2">
          <Select value={picker} onValueChange={setPicker}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Pick a batch…" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.itemName} · {b.batchNo} · exp{" "}
                  {format(new Date(b.expiryDate), "MM/yy")} · {b.currentQty} in stock
                  {b.isExpired ? " · EXPIRED" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!picker}
            onClick={() => {
              if (lines.some((l) => l.batchId === picker)) {
                toast.info("That batch is already on the list");
                return;
              }
              setLines((l) => [...l, { batchId: picker, qty: "" }]);
              setPicker("");
            }}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="w-28 text-right">Qty</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No batches added yet.
                  </TableCell>
                </TableRow>
              )}
              {lines.map((line, i) => {
                const b = byId.get(line.batchId);
                if (!b) return null;
                const qty = Math.abs(Number(line.qty) || 0);
                const over = sign < 0 && qty > b.currentQty;
                return (
                  <TableRow key={line.batchId}>
                    <TableCell>{b.itemName}</TableCell>
                    <TableCell className="font-mono text-xs">{b.batchNo}</TableCell>
                    <TableCell>
                      <span className={cn(b.isExpired && "font-medium text-destructive")}>
                        {format(new Date(b.expiryDate), "MMM yyyy")}
                      </span>
                      {b.isExpired && (
                        <Badge variant="destructive" className="ml-2">
                          Expired
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.currentQty}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={line.qty}
                        className={cn("text-right", over && "border-destructive")}
                        onChange={(e) =>
                          setLines((all) =>
                            all.map((l, j) => (j === i ? { ...l, qty: e.target.value } : l))
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₹{(qty * b.purchaseRate).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setLines((all) => all.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note</Label>
        <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Value at cost </span>
          <span className="font-semibold tabular-nums">₹{value.toFixed(2)}</span>
        </div>
        <Button disabled={pending || lines.length === 0} onClick={submit}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Record adjustment
        </Button>
      </div>
    </div>
  );
}
