"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ReceiptView } from "./receipt-view";
import { SendWhatsAppButton } from "@/components/whatsapp/send-whatsapp-button";
import { SendSmsButton } from "@/components/sms/send-sms-button";
import { sendReceiptSms } from "@/lib/actions/sms";
import { CancelInvoiceButton } from "@/components/receipt/cancel-invoice-button";
import { ReceiptEmailButton } from "@/components/email/receipt-email-button";
import { EinvoiceActions } from "@/components/einvoice/einvoice-actions";
import { sendReceiptWhatsApp } from "@/lib/actions/whatsapp";
import type { ReceiptData } from "@/lib/actions/invoices";
import { ChevronLeft, Printer, FileImage, FileDown, Undo2 } from "lucide-react";
import { format } from "date-fns";

type PaperSize = "58mm" | "80mm" | "a5" | "a4";

// Key order drives the order of the buttons: thermal rolls first, then cut
// sheet. `margin` lives here rather than in a conditional at the call site
// so each size carries its own page setup.
const PAPER_CONFIG: Record<
  PaperSize,
  { label: string; width: string; pageSize: string; margin: string }
> = {
  "58mm": { label: "58mm thermal", width: "58mm", pageSize: "58mm auto", margin: "0" },
  "80mm": { label: "80mm thermal", width: "80mm", pageSize: "80mm auto", margin: "0" },
  a5: { label: "A5", width: "148mm", pageSize: "A5", margin: "10mm" },
  a4: { label: "A4 / PDF", width: "210mm", pageSize: "A4", margin: "12mm" },
};

// A5 is the shipped default — the patient bill handed over with the
// medicines — but an owner who prints on thermal rolls all day can change
// it in /branding. The other sizes stay one click away either way.
const FALLBACK_PAPER_SIZE: PaperSize = "a5";

const isPaperSize = (v: string): v is PaperSize =>
  v === "58mm" || v === "80mm" || v === "a5" || v === "a4";

export function ReceiptPageClient({
  data,
  canCancel = false,
}: {
  data: ReceiptData;
  canCancel?: boolean;
}) {
  const [paperSize, setPaperSize] = useState<PaperSize>(
    isPaperSize(data.tenant.paperDefault) ? data.tenant.paperDefault : FALLBACK_PAPER_SIZE
  );
  const config = PAPER_CONFIG[paperSize];

  return (
    <div className="p-6">
      <style>{`@page { size: ${config.pageSize}; margin: ${config.margin}; }`}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/pos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to billing
        </Link>
        <div className="flex items-center gap-2">
          {data.prescriptionImageUrl && (
            <Button asChild size="sm" variant="outline">
              <a
                href={`/api/files/prescriptions/${data.prescriptionImageUrl}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileImage className="h-4 w-4" /> Prescription
              </a>
            </Button>
          )}
          <div className="flex overflow-hidden rounded-md border">
            {(Object.keys(PAPER_CONFIG) as PaperSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setPaperSize(size)}
                className={`px-2.5 py-1 text-xs ${
                  paperSize === size ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {PAPER_CONFIG[size].label}
              </button>
            ))}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/sales-returns/new?invoiceId=${data.id}`}>
              <Undo2 className="h-4 w-4" /> Return
            </Link>
          </Button>
          {/* Only offered while the server would actually allow it: today's
              bill, nothing returned against it yet. */}
          {canCancel && (
            <CancelInvoiceButton invoiceId={data.id} invoiceNo={data.invoiceNo} />
          )}
          {/* A real server-rendered PDF, not print-to-PDF: this is the file
              staff attach in WhatsApp, which cannot take one from the app. */}
          <Button asChild size="sm" variant="outline">
            <a href={`/api/invoices/${data.id}/pdf`} download>
              <FileDown className="h-4 w-4" /> PDF
            </a>
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <SendSmsButton
            defaultPhone={data.customer?.phone ?? data.patientPhone ?? null}
            onSend={(phone) => sendReceiptSms({ invoiceId: data.id, phone })}
          />
          <SendWhatsAppButton
            defaultPhone={data.customer?.phone ?? null}
            onSend={(phone) => sendReceiptWhatsApp(data.id, phone)}
          />
          {/* Customer has no email column on this schema (walk-in retail), so
              the field starts blank for staff to type. */}
          <ReceiptEmailButton invoiceId={data.id} defaultEmail={null} />
          <EinvoiceActions
            invoiceId={data.id}
            einvoiceEnabled={data.einvoiceEnabled}
            hasIrn={!!data.einvoiceIrn}
            total={data.total}
            ewayBillThreshold={data.ewayBillThreshold}
            hasEwayBill={!!data.ewayBillNo}
          />
        </div>
      </div>

      {data.pharmacistSignoff && (
        <p className="mb-2 text-center text-xs text-muted-foreground print:hidden">
          Signed off by {data.pharmacistSignoff.name}
          {data.pharmacistSignoff.at ? ` · ${format(new Date(data.pharmacistSignoff.at), "dd MMM yyyy, h:mm a")}` : ""}
        </p>
      )}

      <div
        className="mx-auto border shadow-sm print:border-0 print:shadow-none"
        style={{ width: config.width }}
      >
        {/* Cut-sheet paper gets the two-column header/footer; thermal rolls
            stay stacked and centred. */}
        <ReceiptView data={data} layout={paperSize === "a4" || paperSize === "a5" ? "wide" : "narrow"} />
      </div>
    </div>
  );
}
