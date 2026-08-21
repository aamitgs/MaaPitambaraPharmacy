"use client";

import { useEffect, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  holdSale,
  listHeldSales,
  resumeHeldSale,
  discardHeldSale,
  type HeldSaleSummary,
} from "@/lib/actions/held-sales";
import type { CartSnapshot } from "@/store/cart-store";
import { Loader2, PauseCircle, PlayCircle, Trash2 } from "lucide-react";

/**
 * Two controls that share one piece of state: the Hold button (only useful
 * with something in the cart) and the Held list (only useful when there is
 * something parked).
 */
export function HeldSales({
  cartIsEmpty,
  getSnapshot,
  estimatedTotal,
  itemCount,
  onResume,
  onHeld,
  suggestedLabel,
}: {
  cartIsEmpty: boolean;
  getSnapshot: () => CartSnapshot;
  estimatedTotal: number;
  itemCount: number;
  onResume: (snapshot: CartSnapshot) => void;
  /** Called once the cart has been parked, so the till can start fresh. */
  onHeld: () => void;
  suggestedLabel: string;
}) {
  const [held, setHeld] = useState<HeldSaleSummary[]>([]);
  const [pending, startTransition] = useTransition();
  const [holdOpen, setHoldOpen] = useState(false);
  const [label, setLabel] = useState("");

  const refresh = () =>
    listHeldSales()
      .then(setHeld)
      .catch(() => {
        // A failed refresh must not break billing — the counter can still
        // sell without knowing what is parked.
      });

  useEffect(() => {
    refresh();
  }, []);

  function doHold() {
    startTransition(async () => {
      try {
        await holdSale({
          label: label.trim() || suggestedLabel,
          cart: getSnapshot(),
          itemCount,
          estimatedTotal,
        });
        toast.success("Sale held");
        setHoldOpen(false);
        setLabel("");
        onHeld();
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not hold this sale");
      }
    });
  }

  function doResume(id: string) {
    startTransition(async () => {
      try {
        const result = await resumeHeldSale(id);
        onResume(result.cart as unknown as CartSnapshot);
        toast.success(`Resumed "${result.label}"`);
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not resume");
        await refresh();
      }
    });
  }

  function doDiscard(id: string) {
    startTransition(async () => {
      await discardHeldSale(id).catch(() => {});
      await refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={cartIsEmpty || pending}
        onClick={() => {
          setLabel(suggestedLabel);
          setHoldOpen(true);
        }}
      >
        <PauseCircle className="h-4 w-4" /> Hold
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={held.length === 0}>
            Held
            {held.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {held.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="max-h-80 divide-y overflow-y-auto">
            {held.map((h) => (
              <div key={h.id} className="flex items-center gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{h.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {h.itemCount} item{h.itemCount === 1 ? "" : "s"} · ₹
                    {h.estimatedTotal.toFixed(2)} · {h.heldByName} ·{" "}
                    {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}
                  </div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Resume ${h.label}`}
                  disabled={pending}
                  onClick={() => doResume(h.id)}
                >
                  <PlayCircle className="h-4 w-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Discard ${h.label}`}
                  disabled={pending}
                  onClick={() => doDiscard(h.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hold this sale</DialogTitle>
            <DialogDescription>
              Parks the cart so you can serve the next customer. Nothing is sold and no stock is
              reserved, so items stay available to other tills.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="hold-label">Name this hold</Label>
            <Input
              id="hold-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Mrs Sharma, gone for prescription"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHoldOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doHold} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
