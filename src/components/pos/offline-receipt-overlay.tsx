"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ReceiptView } from "@/components/receipt/receipt-view";
import type { ReceiptData } from "@/lib/actions/invoices";
import { Printer, Plus, WifiOff } from "lucide-react";

export function OfflineReceiptOverlay({
  data,
  onNewSale,
}: {
  data: ReceiptData;
  onNewSale: () => void;
}) {
  // Portalled to document.body — the app shell's layout can otherwise
  // clip or scroll a `position: fixed` element that's nested deep inside
  // it, and this overlay must cover the entire screen unambiguously.
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-6">
      <style>{`@page { size: 80mm auto; margin: 0; }`}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2 rounded-md bg-warning/20 px-3 py-1.5 text-sm font-medium text-warning-foreground">
          <WifiOff className="h-4 w-4" />
          Saved offline — will sync automatically when back online
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button size="sm" variant="outline" onClick={onNewSale}>
            <Plus className="h-4 w-4" /> New sale
          </Button>
        </div>
      </div>

      <div className="mx-auto w-[80mm] border shadow-sm print:border-0 print:shadow-none">
        <ReceiptView data={data} />
      </div>
    </div>,
    document.body
  );
}
