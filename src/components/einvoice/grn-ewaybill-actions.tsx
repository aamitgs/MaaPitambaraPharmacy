"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryEwayBillForGrn } from "@/lib/actions/einvoice";
import { Truck, Loader2 } from "lucide-react";

export function GrnEwayBillActions({
  grnId,
  total,
  ewayBillThreshold,
  hasEwayBill,
}: {
  grnId: string;
  total: number;
  ewayBillThreshold: number;
  hasEwayBill: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (hasEwayBill || total < ewayBillThreshold) return null;

  function handleClick() {
    startTransition(async () => {
      const result = await retryEwayBillForGrn(grnId);
      if (result.success) {
        toast.success("e-Way bill generated");
      } else {
        toast.error(result.note ?? "Generation failed");
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
      Generate e-way bill
    </Button>
  );
}
