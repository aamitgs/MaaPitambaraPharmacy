"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteLoyaltyTier } from "@/lib/actions/loyalty-tiers";

export function DeleteTierButton({ tierId }: { tierId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Delete this loyalty tier? Customers on it will lose the tier until they re-qualify.")) return;
    startTransition(async () => {
      try {
        await deleteLoyaltyTier(tierId);
        toast.success("Tier deleted");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleDelete} disabled={pending}>
      Delete
    </Button>
  );
}
