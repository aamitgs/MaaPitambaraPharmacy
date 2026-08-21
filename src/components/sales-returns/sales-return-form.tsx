"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createSalesReturn, type ReturnableInvoice } from "@/lib/actions/sales-returns";
import { Loader2, TriangleAlert } from "lucide-react";

const REASONS = [
  "Wrong item supplied",
  "Wrong strength",
  "Duplicate purchase",
  "Damaged packaging",
  "Customer changed mind",
];

export function SalesReturnForm({ invoice }: { invoice: ReturnableInvoice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [refundMethod, setRefundMethod] = useState(
    invoice.paymentMode === "credit" ? "credit_account" : invoice.paymentMode
  );
  const [managerPin, setManagerPin] = useState("");

  const lines = invoice.lines
    .map((line) => ({ line, qty: Number(qty[line.invoiceItemId] ?? 0) }))
    .filter((l) => l.qty > 0);

  const refundTotal = lines.reduce(
    (sum, l) => sum + l.qty * l.line.rate * (1 + l.line.taxRate / 100),
    0
  );

  function submit() {
    startTransition(async () => {
      try {
        const created = await createSalesReturn({
          invoiceId: invoice.id,
          reason,
          refundMethod: refundMethod as "cash" | "upi" | "card" | "credit_account",
          managerPin,
          lines: lines.map((l) => ({
            invoiceItemId: l.line.invoiceItemId,
            qty: l.qty,
            restock: restock[l.line.invoiceItemId] ?? true,
          })),
        });
        toast.success("Credit note created");
        router.push(`/sales-returns/${created.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create the return");
      }
    });
  }

  return (
    <div className="max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Return against {invoice.invoiceNo}</h1>
        <p className="text-sm text-muted-foreground">
          Sold {format(new Date(invoice.invoiceDate), "dd MMM yyyy")} ·{" "}
          {invoice.customerName ?? "Walk-in"} · {invoice.daysSinceSale} day
          {invoice.daysSinceSale === 1 ? "" : "s"} ago
        </p>
      </div>

      {invoice.windowExpired && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>
            {invoice.windowDays === 0
              ? "Returns are switched off for this pharmacy."
              : `Outside the ${invoice.windowDays}-day return window — this sale can no longer be returned.`}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Items on this bill
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {invoice.lines.map((line) => {
            const blocked = Boolean(line.blockedReason) || invoice.windowExpired;
            return (
              <div
                key={line.invoiceItemId}
                className={cn("rounded-lg border p-3", blocked && "bg-muted/40 opacity-70")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">{line.itemName}</div>
                    <div className="text-xs text-muted-foreground">
                      Batch {line.batchNo} · exp{" "}
                      {format(new Date(line.expiryDate), "MM/yy")} · sold {line.soldQty} @ ₹
                      {line.rate.toFixed(2)}
                      {line.alreadyReturned > 0 && ` · ${line.alreadyReturned} returned already`}
                    </div>
                    {line.blockedReason && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <TriangleAlert className="h-3.5 w-3.5" /> {line.blockedReason}
                      </div>
                    )}
                  </div>
                  {!blocked && (
                    <div className="flex shrink-0 items-end gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Return qty</Label>
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min={0}
                          max={line.returnableQty}
                          value={qty[line.invoiceItemId] ?? ""}
                          onChange={(e) =>
                            setQty((p) => ({ ...p, [line.invoiceItemId]: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Condition</Label>
                        <Select
                          value={(restock[line.invoiceItemId] ?? true) ? "restock" : "writeoff"}
                          onValueChange={(v) =>
                            setRestock((p) => ({ ...p, [line.invoiceItemId]: v === "restock" }))
                          }
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="restock">Back to stock</SelectItem>
                            <SelectItem value="writeoff">Write off</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-3 gap-4 p-4">
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Refund by</Label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash from the till</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="credit_account" disabled={!invoice.customerId}>
                  Against credit account
                </SelectItem>
              </SelectContent>
            </Select>
            {!invoice.customerId && (
              <p className="text-[11px] text-muted-foreground">
                Walk-in sale — no credit account to adjust.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manager-pin">Manager PIN</Label>
            <Input
              id="manager-pin"
              type="password"
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <div className="text-xs text-muted-foreground">Refund total</div>
          <div className="text-2xl font-semibold tabular-nums text-brand-maroon">
            ₹{refundTotal.toFixed(2)}
          </div>
        </div>
        <Button
          disabled={pending || lines.length === 0 || !managerPin || invoice.windowExpired}
          onClick={submit}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create credit note
        </Button>
      </div>
    </div>
  );
}
