"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { recordExpense } from "@/lib/actions/expenses";
import { Loader2, Plus } from "lucide-react";
import { toLocalDateString } from "@/lib/date-range";

const MODES = ["cash", "upi", "card", "credit"] as const;

export function ExpenseForm({
  categories,
}: {
  categories: { id: string; name: string; isRecurring: boolean }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [incurredOn, setIncurredOn] = useState(toLocalDateString(new Date()));
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<(typeof MODES)[number]>("cash");
  const [payee, setPayee] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    startTransition(async () => {
      try {
        await recordExpense({
          categoryId,
          incurredOn,
          amount: Number(amount),
          paymentMode,
          payee: payee || undefined,
          note: note || undefined,
        });
        toast.success("Expense recorded");
        setOpen(false);
        setAmount("");
        setPayee("");
        setNote("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not record it");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Record an expense
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record an expense</DialogTitle>
            <DialogDescription>
              Running costs only — rent, salaries, electricity. Stock you bought is already
              recorded through GRN and must not be entered here, or it would count twice.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="exp-cat">Category</Label>
              <select
                id="exp-cat"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isRecurring ? " (monthly)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Date of the cost</Label>
              <Input
                id="exp-date"
                type="date"
                value={incurredOn}
                onChange={(e) => setIncurredOn(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                When it applies to, not when it was paid.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount (₹)</Label>
              <Input
                id="exp-amount"
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-mode">Paid by</Label>
              <select
                id="exp-mode"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm capitalize"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as (typeof MODES)[number])}
              >
                {MODES.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-payee">Paid to</Label>
              <Input id="exp-payee" value={payee} onChange={(e) => setPayee(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="exp-note">Note</Label>
              <Input id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !amount || !categoryId}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
