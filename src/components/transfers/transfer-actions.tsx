"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveStockTransfer, rejectStockTransfer } from "@/lib/actions/stock-transfers";
import { Check, X } from "lucide-react";

export function TransferActions({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      try {
        await approveStockTransfer(transferId);
        toast.success("Transfer approved — stock moved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not approve transfer");
      }
    });
  }

  function reject() {
    startTransition(async () => {
      try {
        await rejectStockTransfer(transferId);
        toast.success("Transfer rejected");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reject transfer");
      }
    });
  }

  return (
    <div className="flex gap-1.5">
      <Button size="sm" disabled={pending} onClick={approve}>
        <Check className="h-3.5 w-3.5" /> Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={reject}>
        <X className="h-3.5 w-3.5" /> Reject
      </Button>
    </div>
  );
}
