"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updatePurchaseOrderStatus } from "@/lib/actions/purchase-orders";
import { FilePlus2 } from "lucide-react";

export function PoStatusActions({
  poId,
  status,
  supplierId,
}: {
  poId: string;
  status: string;
  supplierId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(next: "sent" | "cancelled") {
    startTransition(async () => {
      try {
        await updatePurchaseOrderStatus(poId, next);
        toast.success(next === "sent" ? "Marked as sent" : "Purchase order cancelled");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="flex gap-2">
      {status === "draft" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setStatus("sent")}>
          Mark as sent
        </Button>
      )}
      {(status === "draft" || status === "sent") && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setStatus("cancelled")}>
          Cancel
        </Button>
      )}
      {status !== "cancelled" && (
        <Button asChild size="sm">
          <Link href={`/grn/new?supplierId=${supplierId}&poId=${poId}`}>
            <FilePlus2 /> Create GRN
          </Link>
        </Button>
      )}
    </div>
  );
}
