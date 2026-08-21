"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { closeCashUp, type CashUpDraft } from "@/lib/actions/cash-up";
import { Banknote, Loader2 } from "lucide-react";

const money = (n: number) => `₹${n.toFixed(2)}`;

export function CashUpForm({ draft }: { draft: CashUpDraft }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openingFloat, setOpeningFloat] = useState(String(draft.suggestedFloat));
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");

  const float = Number(openingFloat) || 0;
  const counted = countedCash === "" ? null : Number(countedCash);
  const expected = float + draft.cashSales - draft.cashRefunds;
  const variance = counted === null ? null : counted - expected;

  function close() {
    startTransition(async () => {
      try {
        const result = await closeCashUp({
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          openingFloat: float,
          countedCash: counted ?? 0,
          note: note || undefined,
        });
        toast.success(
          result.variance === 0
            ? "Drawer balanced"
            : `Recorded with a ${result.variance > 0 ? "surplus" : "shortfall"} of ₹${Math.abs(result.variance).toFixed(2)}`
        );
        setCountedCash("");
        setNote("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not close the shift");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {draft.lastClosedAt
            ? `Since the last count, ${format(new Date(draft.lastClosedAt), "dd MMM h:mm a")}`
            : "Since midnight"}{" "}
          · {draft.invoiceCount} bill{draft.invoiceCount === 1 ? "" : "s"}
          {draft.refundCount > 0 &&
            ` · ${draft.refundCount} refund${draft.refundCount === 1 ? "" : "s"}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 text-sm">
          <div className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Takings by mode
          </div>
          {[
            ["Cash", draft.cashSales, true],
            ["UPI", draft.upiSales, false],
            ["Card", draft.cardSales, false],
            ["Credit (not collected)", draft.creditSales, false],
          ].map(([label, value, isCash]) => (
            <div
              key={label as string}
              className={cn("flex justify-between", !isCash && "text-muted-foreground")}
            >
              <span>{label as string}</span>
              <span className="tabular-nums">{money(value as number)}</span>
            </div>
          ))}

          <Separator className="my-2" />

          <div className="flex justify-between">
            <span>Cash refunded</span>
            <span className="tabular-nums text-destructive">−{money(draft.cashRefunds)}</span>
          </div>
          {draft.otherRefunds > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Refunded by UPI/card (not from the drawer)</span>
              <span className="tabular-nums">−{money(draft.otherRefunds)}</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="float">Opening float</Label>
            <Input
              id="float"
              type="number"
              step="0.01"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {draft.lastClosedAt
                ? "Pre-filled with what the last count was left with."
                : "What was in the drawer before trading started."}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Drawer should hold</span>
              <span className="text-lg font-semibold tabular-nums">{money(expected)}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Float + cash takings − cash refunds. UPI, card and credit never touch the drawer.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="counted">Counted in the drawer</Label>
            <Input
              id="counted"
              type="number"
              step="0.01"
              placeholder="Count the cash and enter it"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
            />
          </div>

          {variance !== null && (
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border p-3",
                variance === 0 && "border-success/40 bg-success/10",
                variance !== 0 && "border-destructive/40 bg-destructive/10"
              )}
            >
              <span className="text-sm font-medium">
                {variance === 0 ? "Balanced" : variance > 0 ? "Surplus" : "Short"}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {variance === 0 ? money(0) : `${variance > 0 ? "+" : "−"}${money(Math.abs(variance))}`}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note">Note {variance !== null && variance !== 0 && "(explain the difference)"}</Label>
            <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <Button className="w-full" disabled={pending || counted === null} onClick={close}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Close shift and record
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
