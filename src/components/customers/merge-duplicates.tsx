"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Merge, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mergeCustomers } from "@/lib/actions/customer-merge";
import type { DuplicateMember } from "@/lib/actions/customer-merge";

export function DuplicateGroupCard({
  reason,
  members,
}: {
  reason: "phone" | "name";
  members: DuplicateMember[];
}) {
  const router = useRouter();
  // The oldest record wins by default: it is the one with the longest
  // history and the one staff are most likely to recognise.
  const [survivorId, setSurvivorId] = useState(
    [...members].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0].id
  );
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const combined = members.reduce((s, m) => s + m.balance, 0);
  const survivor = members.find((m) => m.id === survivorId);

  function run() {
    startTransition(async () => {
      try {
        const r = await mergeCustomers(
          survivorId,
          members.map((m) => m.id)
        );
        toast.success(
          `Merged ${r.mergedCount + 1} records into ${survivor?.name}. Balance ₹${r.balance.toFixed(2)}.`
        );
        setConfirming(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        {reason === "phone" ? (
          <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
            Same phone number
          </Badge>
        ) : (
          <Badge variant="outline">Same name — check before merging</Badge>
        )}
        <span className="text-sm text-muted-foreground">
          {members.length} records · ₹{combined.toFixed(2)} between them
        </span>
      </div>

      <div className="space-y-1.5">
        {members.map((m) => (
          <label
            key={m.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm",
              m.id === survivorId ? "border-primary bg-primary/5" : "border-transparent bg-muted/40"
            )}
          >
            <input
              type="radio"
              name={`survivor-${members[0].id}`}
              checked={m.id === survivorId}
              onChange={() => setSurvivorId(m.id)}
              className="h-4 w-4 accent-primary"
            />
            <span className="min-w-40 font-medium">{m.name}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              {m.phone ? (
                <>
                  <Phone className="h-3 w-3" /> {m.phone}
                </>
              ) : (
                "no phone"
              )}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {m.invoiceCount} bill{m.invoiceCount === 1 ? "" : "s"}
            </span>
            <span
              className={cn("tabular-nums", m.balance > 0.005 && "font-medium text-destructive")}
            >
              ₹{m.balance.toFixed(2)}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {m.lastSeen ? `last ${format(new Date(m.lastSeen), "d MMM yyyy")}` : "never billed"}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setConfirming(true)} disabled={pending}>
          <Merge /> Merge into {survivor?.name}
        </Button>
        <span className="text-xs text-muted-foreground">
          The selected record is kept; the others are folded into it.
        </span>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {members.length} records into {survivor?.name}?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Every bill, payment and message moves onto {survivor?.name}. The combined
                  balance becomes <strong>₹{combined.toFixed(2)}</strong>.
                </p>
                <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-warning-foreground">
                  This cannot be undone from the app. If these are two different people, their
                  money ends up on one account.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={run} disabled={pending}>
              Merge records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
