"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RotateCcw, Search } from "lucide-react";

const PAYMENT_MODES = [
  { value: "all", label: "Any payment" },
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit" },
];

/**
 * Filters live in the URL rather than component state, so a search staff
 * want again is a bookmark, and "this month's credit sales" is a link
 * someone can be sent.
 */
export function InvoiceFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [medicine, setMedicine] = useState(params.get("medicine") ?? "");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [paymentMode, setPaymentMode] = useState(params.get("paymentMode") ?? "all");
  const [status, setStatus] = useState(params.get("status") ?? "all");

  function apply() {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (medicine.trim()) next.set("medicine", medicine.trim());
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (paymentMode !== "all") next.set("paymentMode", paymentMode);
    if (status !== "all") next.set("status", status);
    startTransition(() => router.push(`/invoices?${next.toString()}`));
  }

  function reset() {
    setQ(""); setMedicine(""); setFrom(""); setTo("");
    setPaymentMode("all"); setStatus("all");
    startTransition(() => router.push("/invoices"));
  }

  const hasFilters = q || medicine || from || to || paymentMode !== "all" || status !== "all";

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
      onSubmit={(e) => { e.preventDefault(); apply(); }}
    >
      <div className="min-w-52 flex-1 space-y-1.5">
        <Label htmlFor="inv-q" className="text-xs">Bill no., customer or patient</Label>
        <Input id="inv-q" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="INV-2026… or a name or phone" />
      </div>

      <div className="min-w-44 flex-1 space-y-1.5">
        <Label htmlFor="inv-med" className="text-xs">Contains medicine</Label>
        <Input id="inv-med" value={medicine} onChange={(e) => setMedicine(e.target.value)}
          placeholder="Name, generic or barcode" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-from" className="text-xs">From</Label>
        <Input id="inv-from" type="date" className="w-40" value={from}
          onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inv-to" className="text-xs">To</Label>
        <Input id="inv-to" type="date" className="w-40" value={to}
          onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-mode" className="text-xs">Payment</Label>
        <select id="inv-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          {PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-status" className="text-xs">Status</Label>
        <select id="inv-status" value={status} onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">Any status</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        Search
      </Button>
      {hasFilters && (
        <Button type="button" variant="ghost" onClick={reset} disabled={pending}>
          <RotateCcw className="h-4 w-4" /> Clear
        </Button>
      )}
    </form>
  );
}
