"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryEinvoice, retryEwayBillForInvoice } from "@/lib/actions/einvoice";
import { QrCode, Truck, Loader2 } from "lucide-react";

export function EinvoiceActions({
  invoiceId,
  einvoiceEnabled,
  hasIrn,
  total,
  ewayBillThreshold,
  hasEwayBill,
}: {
  invoiceId: string;
  einvoiceEnabled: boolean;
  hasIrn: boolean;
  total: number;
  ewayBillThreshold: number;
  hasEwayBill: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handle(action: "einvoice" | "ewaybill") {
    startTransition(async () => {
      const result = action === "einvoice" ? await retryEinvoice(invoiceId) : await retryEwayBillForInvoice(invoiceId);
      if (result.success) {
        toast.success(action === "einvoice" ? "e-Invoice generated" : "e-Way bill generated");
      } else {
        toast.error(result.note ?? "Generation failed");
      }
    });
  }

  const showEinvoiceButton = einvoiceEnabled && !hasIrn;
  const showEwayBillButton = total >= ewayBillThreshold && !hasEwayBill;

  if (!showEinvoiceButton && !showEwayBillButton) return null;

  return (
    <>
      {showEinvoiceButton && (
        <Button size="sm" variant="outline" onClick={() => handle("einvoice")} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          Generate e-invoice
        </Button>
      )}
      {showEwayBillButton && (
        <Button size="sm" variant="outline" onClick={() => handle("ewaybill")} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          Generate e-way bill
        </Button>
      )}
    </>
  );
}
