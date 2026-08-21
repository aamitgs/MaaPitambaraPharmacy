"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setItemActive } from "@/lib/actions/items";

export function RetireItemButton({
  itemId,
  itemName,
  isActive,
  stockOnHand,
}: {
  itemId: string;
  itemName: string;
  isActive: boolean;
  /// Shown before retiring, because the stock does not go anywhere and
  /// somebody still has to decide what happens to it.
  stockOnHand: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        await setItemActive(itemId, !isActive);
        toast.success(isActive ? `${itemName} retired` : `${itemName} back in use`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {isActive ? (
            <>
              <Archive /> Retire
            </>
          ) : (
            <>
              <RotateCcw /> Bring back
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isActive ? `Retire ${itemName}?` : `Bring ${itemName} back?`}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              {isActive ? (
                <>
                  <p>
                    It disappears from the billing screen, from search and from reorder
                    suggestions. Nothing is deleted — past bills, GST returns and the item&apos;s
                    own history stay exactly as they are, and expiry alerts keep watching whatever
                    is still on the shelf.
                  </p>
                  {stockOnHand > 0 && (
                    <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-warning-foreground">
                      {stockOnHand} unit(s) still in stock. Retiring does not remove them — they
                      simply stop being sellable. Sell them through first, or write them off under
                      Stock Adjustments.
                    </p>
                  )}
                </>
              ) : (
                <p>It goes back into the billing screen, search and reorder suggestions.</p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={run} disabled={pending} variant={isActive ? "destructive" : "default"}>
            {isActive ? "Retire item" : "Bring back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
