"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Barcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assignInternalBarcode } from "@/lib/actions/items";

export function AssignBarcodeButton({ itemId, itemName }: { itemId: string; itemName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const item = await assignInternalBarcode(itemId);
            toast.success(`${itemName} now has barcode ${item.barcode}`);
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong");
          }
        })
      }
    >
      <Barcode /> Issue a barcode
    </Button>
  );
}
