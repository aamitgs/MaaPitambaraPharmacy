"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openStockCount } from "@/lib/actions/stock-counts";
import { ClipboardList, Loader2 } from "lucide-react";

export function StartCountButton({
  hasOpenCount,
  openCountId,
}: {
  hasOpenCount: boolean;
  openCountId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [includeZero, setIncludeZero] = useState(false);
  const [pending, startTransition] = useTransition();

  // Only one count per branch at a time — two would each freeze a different
  // snapshot and then fight over the same batches when posted.
  if (hasOpenCount && openCountId) {
    return (
      <Button onClick={() => router.push(`/stock-counts/${openCountId}`)}>
        <ClipboardList className="h-4 w-4" /> Continue open count
      </Button>
    );
  }

  function start() {
    startTransition(async () => {
      try {
        const result = await openStockCount({
          note: note || undefined,
          includeZeroQty: includeZero,
        });
        toast.success(`${result.countNo} opened — ${result.lineCount} batches to count`);
        router.push(`/stock-counts/${result.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start a count");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ClipboardList className="h-4 w-4" /> Start a count
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a stock count</DialogTitle>
            <DialogDescription>
              Freezes the system quantity for every batch at this branch so the target does not
              move while you count. Selling can carry on — posting measures from where stock
              stands then, not from the frozen figure.
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-start gap-2.5 rounded-lg border p-3">
            <Checkbox
              checked={includeZero}
              onCheckedChange={(v) => setIncludeZero(Boolean(v))}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">Include batches showing zero</div>
              <p className="text-[11px] text-muted-foreground">
                Slower, but catches stock sitting on the shelf that the system thinks is gone.
              </p>
            </div>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="count-note">Note</Label>
            <Textarea
              id="count-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Monthly count, front shelves"
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
