import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Phone, Smartphone } from "lucide-react";
import type { ReceiptData } from "@/lib/actions/invoices";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit",
};

/**
 * `layout` follows the chosen paper, not the screen: two columns need real
 * width, and a 58mm roll is about 32 characters across — columns there wrap
 * into mush. Thermal keeps the stacked, centred form; A5/A4 pair the blocks
 * up to buy vertical space for item lines.
 */
export function ReceiptView({
  data,
  layout = "narrow",
}: {
  data: ReceiptData;
  layout?: "narrow" | "wide";
}) {
  const wide = layout === "wide";
  const isThermal = !wide;
  /**
   * Both numbers on one line — the header has been squeezed hard for item
   * space and a second phone row would give some of it back. Landline
   * first, then mobile; the icons tell them apart without labels, which is
   * what keeps them on a single line.
   */
  const contactNos = (
    <span className="inline-flex items-center gap-2">
      {data.branch.landline && (
        <span className="inline-flex items-center gap-1">
          <Phone className="h-2.5 w-2.5 shrink-0" aria-label="Landline" />
          {data.branch.landline}
        </span>
      )}
      {data.branch.phone && (
        <span className="inline-flex items-center gap-1">
          <Smartphone className="h-2.5 w-2.5 shrink-0" aria-label="Mobile" />
          {data.branch.phone}
        </span>
      )}
    </span>
  );
  const hasContact = Boolean(data.branch.landline || data.branch.phone);
  const licenceNos = [
    data.branch.drugLicenseRetailNo,
    data.branch.drugLicenseWholesaleNo,
  ].filter(Boolean);

  return (
    <div
      id="receipt-content"
      className="mx-auto w-full bg-white p-4 font-mono text-[11px] leading-snug text-black print:p-2"
    >
      {/* Plain <img>, matching the QR below: next/image lazy-loads by
          default, and an image that hasn't loaded yet is an image missing
          from the printed bill. The roundel only — the wordmark would just
          repeat the pharmacy name printed beside it. */}
      {wide ? (
        <div>
          <div className="flex items-start justify-between gap-4">
            {/* Address sits under the lockup rather than beside it: squeezed
                into a middle column between logo and registrations it wrapped
                to three lines, which cost back the space this layout saves.
                Note this prints the brand asset rather than
                `tenant.pharmacyName` — renaming the tenant in Settings will
                not change what a cut-sheet bill shows. */}
            <div className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-horizontal.png"
                alt={data.tenant.pharmacyName}
                width={1348}
                height={440}
                className="mb-1 h-11 w-auto object-contain"
              />
              <div className="text-[10px] whitespace-pre-line">{data.branch.licensedAddress}</div>
            </div>
            {/* Middle column of the header row rather than a line of its own
                — the two side columns are four lines tall, so the title costs
                nothing here. */}
            <div className="shrink-0 self-center px-3 text-[11px] font-bold tracking-[0.2em]">
              GST INVOICE
            </div>
            <div className="flex items-start gap-4">
              {/* Both licences on one line with a short "DL:" label — the
                  full "Licence No.:" wording used on thermal is too wide for
                  a right-hand column once both numbers share the line. */}
              <div className="shrink-0 text-right text-[10px] whitespace-nowrap">
                {hasContact && <div className="flex justify-end">{contactNos}</div>}
                {data.branch.gstin && <div>GSTIN: {data.branch.gstin}</div>}
                {licenceNos.length > 0 && <div>DL: {licenceNos.join(", ")}</div>}
                {data.branch.fssaiNo && <div>FSSAI: {data.branch.fssaiNo}</div>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-icon.png"
            alt=""
            width={48}
            height={48}
            className="mx-auto mb-1 h-12 w-12 object-contain"
          />
          <div className="text-sm font-bold">{data.tenant.pharmacyName}</div>
          <div className="text-[10px] whitespace-pre-line">{data.branch.licensedAddress}</div>
          {hasContact && (
            <div className="flex justify-center text-[10px]">{contactNos}</div>
          )}
          {data.branch.gstin && <div className="text-[10px]">GSTIN: {data.branch.gstin}</div>}
          {/* Both drug licences on one line, matching the format already used
              on this pharmacy's printed bills, and kept to one line so a 58mm
              roll doesn't lose two more. */}
          {licenceNos.length > 0 && (
            <div className="text-[10px]">Licence No.: {licenceNos.join(", ")}</div>
          )}
          {data.branch.fssaiNo && (
            <div className="text-[10px]">FSSAI: {data.branch.fssaiNo}</div>
          )}
          <div className="mt-1.5 text-[11px] font-bold tracking-[0.2em]">GST INVOICE</div>
        </div>
      )}

      <Divider />

      {/* Payment mode takes the middle on cut-sheet paper so invoice no.,
          mode and timestamp share one row. A 58mm roll is ~32 characters —
          the invoice number alone nearly fills it — so thermal keeps the
          mode on its own line. */}
      <div className="flex justify-between gap-2">
        <span>Invoice: {data.invoiceNo}</span>
        {wide && (
          <span>Payment: {PAYMENT_LABELS[data.paymentMode] ?? data.paymentMode}</span>
        )}
        <span>{format(new Date(data.invoiceDate), "dd/MM/yyyy HH:mm")}</span>
      </div>
      {data.customer && <div>Customer: {data.customer.name}</div>}
      {!wide && (
        <div>Payment: {PAYMENT_LABELS[data.paymentMode] ?? data.paymentMode}</div>
      )}

      <Divider />

      {wide ? (
        /* A real column table on cut-sheet paper — the layout an Indian
           pharmacy bill is expected to have: batch, expiry and MRP per line,
           one row per item instead of four stacked ones.

           The grey sub-line keeps HSN and the CGST/SGST split per line.
           Rule 46 wants the tax amounts shown against the goods, so they stay
           on the bill rather than moving entirely into the totals. */
        <div>
          <div className="grid grid-cols-[0.5fr_3.1fr_1.7fr_1.6fr_1fr_0.7fr_1.2fr_1.2fr_0.8fr_1.6fr] gap-x-1.5 border-y border-black/60 py-1 text-[10px] font-bold">
            <span>#</span>
            <span>Product</span>
            <span>Pack</span>
            <span>Batch</span>
            <span>Exp.</span>
            <span className="text-right">Qty</span>
            <span className="text-right">MRP</span>
            <span className="text-right">Rate</span>
            <span className="text-right">GST%</span>
            <span className="text-right">Amount</span>
          </div>
          {data.items.map((line, i) => (
            <div key={line.id} className="border-b border-dashed border-black/25 py-0.5 text-[10px]">
              <div className="grid grid-cols-[0.5fr_3.1fr_1.7fr_1.6fr_1fr_0.7fr_1.2fr_1.2fr_0.8fr_1.6fr] gap-x-1.5">
                <span className="tabular-nums">{i + 1}</span>
                <span className="font-medium">{line.itemName}</span>
                {/* A size down: "10 tablets" is the common case and needs one
                    more character than the column has at 10px. Still wraps
                    rather than colliding if a pack string is unusually long. */}
                <span className="self-center text-[9px]">{line.packSize ?? "—"}</span>
                <span>{line.batchNo}</span>
                <span className="tabular-nums">
                  {line.expiryDate ? format(new Date(line.expiryDate), "MM/yy") : "—"}
                </span>
                <span className="text-right tabular-nums">{line.qty}</span>
                <span className="text-right tabular-nums">
                  {line.mrp === null ? "—" : line.mrp.toFixed(2)}
                </span>
                <span className="text-right tabular-nums">{line.rate.toFixed(2)}</span>
                <span className="text-right tabular-nums">{line.taxRate}</span>
                <span className="text-right font-medium tabular-nums">
                  {line.lineTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-3 text-[9px] text-neutral-600">
                {line.manufacturer && <span>{line.manufacturer}</span>}
                {line.hsnCode && <span>HSN {line.hsnCode}</span>}
                {line.discountAmount > 0 && (
                  <span>Disc ₹{line.discountAmount.toFixed(2)}</span>
                )}
                {(line.cgstAmount > 0 || line.sgstAmount > 0) && (
                  <span className="ml-auto">
                    CGST ₹{line.cgstAmount.toFixed(2)} · SGST ₹{line.sgstAmount.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <Row cols={isThermal ? [5, 1.5, 1.5, 2] : [4, 1.5, 1.5, 1.5, 2]}>
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amt</span>
          </Row>
          {data.items.map((line) => (
            <div key={line.id}>
              <div className="truncate">
                {line.itemName}
                {line.manufacturer ? ` (${line.manufacturer})` : ""}
              </div>
              <div className="flex justify-between text-[10px] text-neutral-600">
                <span>
                  Batch {line.batchNo}
                  {line.hsnCode ? ` · HSN ${line.hsnCode}` : ""}
                </span>
                {line.discountAmount > 0 && <span>Disc ₹{line.discountAmount.toFixed(2)}</span>}
                <span>GST {line.taxRate}%</span>
              </div>
              {(line.cgstAmount > 0 || line.sgstAmount > 0) && (
                <div className="flex justify-end gap-3 text-[10px] text-neutral-600">
                  <span>CGST ₹{line.cgstAmount.toFixed(2)}</span>
                  <span>SGST ₹{line.sgstAmount.toFixed(2)}</span>
                </div>
              )}
              <Row cols={[5, 1.5, 1.5, 2]}>
                <span />
                <span className="text-right tabular-nums">{line.qty}</span>
                <span className="text-right tabular-nums">{line.rate.toFixed(2)}</span>
                <span className="text-right font-medium tabular-nums">
                  {line.lineTotal.toFixed(2)}
                </span>
              </Row>
            </div>
          ))}
        </div>
      )}

      <Divider />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">₹{data.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <span className="tabular-nums">−₹{data.discountAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>CGST</span>
          <span className="tabular-nums">₹{(data.taxAmount / 2).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>SGST</span>
          <span className="tabular-nums">₹{(data.taxAmount - data.taxAmount / 2).toFixed(2)}</span>
        </div>
        {data.roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span>Round off</span>
            <span className="tabular-nums">
              {data.roundOffAmount < 0 ? "−" : "+"}₹{Math.abs(data.roundOffAmount).toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span>
          <span className="tabular-nums">₹{data.total.toFixed(2)}</span>
        </div>
      </div>

      {(data.doctor || data.patientName || data.patientPhone || data.patientAddress) && (
        <>
          <Divider />
          <div className={cn("text-[10px]", wide && "flex items-start justify-between gap-6")}>
          <div>
            {data.doctor && (
              <div>
                {/* Printed verbatim: names are stored with their title, so
                    prefixing "Dr." here would double it. */}
                {data.doctor.name}
                {data.doctor.registrationNo ? ` (Reg. No. ${data.doctor.registrationNo})` : ""}
                {data.doctor.phone ? ` · ${data.doctor.phone}` : ""}
              </div>
            )}
            {data.patientName && (
              <div>
                Patient: {data.patientName}
                {data.patientAge ? `, Age ${data.patientAge}` : ""}
              </div>
            )}
            {/* Labelled in full: the footer already carries the pharmacy's own
                "Ph:" line, so a bare prefix here would be ambiguous. */}
            {data.patientPhone && <div>Patient phone: {data.patientPhone}</div>}
            {data.patientAddress && <div>Address: {data.patientAddress}</div>}
          </div>
          {/* On wide paper the pay QR sits beside the patient block rather
              than below it — the single biggest vertical saving on the bill. */}
          {wide && data.invoiceQrImageDataUrl && !data.einvoiceQrImageDataUrl && (
            <div className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.invoiceQrImageDataUrl}
                alt="UPI payment QR code"
                className="h-16 w-16"
              />
              <div className="text-[9px] font-medium">Scan &amp; pay</div>
            </div>
          )}
          </div>
        </>
      )}

      {data.branch.pharmacistName && (
        <div className="mt-2 text-[10px]">
          {data.branch.pharmacistName}
          {data.branch.pharmacistRegistrationNo
            ? ` (Reg. ${data.branch.pharmacistRegistrationNo})`
            : ""}
          {wide ? " · " : <br />}
          Authorized signatory
        </div>
      )}

      {data.einvoiceIrn && (
        <>
          <Divider />
          <div className="text-center">
            {data.einvoiceQrImageDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.einvoiceQrImageDataUrl}
                alt="e-Invoice QR code"
                className="mx-auto h-24 w-24"
              />
            )}
            <div className="mt-1 text-[9px] break-all">IRN: {data.einvoiceIrn}</div>
          </div>
        </>
      )}

      {data.ewayBillNo && (
        <div className="text-center text-[10px]">E-way bill: {data.ewayBillNo}</div>
      )}

      {/* UPI pay QR, unless an official e-invoice QR is already printed
          above — two QR codes on one bill invites the wrong scan. On wide
          paper this already rendered beside the patient block. */}
      {!wide && data.invoiceQrImageDataUrl && !data.einvoiceQrImageDataUrl && (
        <>
          <Divider />
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.invoiceQrImageDataUrl}
              alt="UPI payment QR code"
              className="mx-auto h-20 w-20"
            />
            {/* Caption only — no UPI ID or phone printed: the QR already
                carries both, and a bill is not a place to publish them. */}
            <div className="text-[9px] font-medium">Scan &amp; pay</div>
          </div>
        </>
      )}

      {data.tenant.invoiceFooterText && (
        <>
          <Divider />
          {/* "|" splits the footer into lines, so the wording can be
              reshaped from Settings without touching this file. Wide paper
              flows the segments into one paragraph instead. */}
          {wide ? (
            <div className="text-center text-[10px]">
              {data.tenant.invoiceFooterText
                .split("|")
                .map((line) => line.trim())
                .filter(Boolean)
                .join("  ·  ")}
            </div>
          ) : (
            <div className="space-y-0.5 text-center text-[10px]">
              {data.tenant.invoiceFooterText.split("|").map((line, i) => (
                <div key={i}>{line.trim()}</div>
              ))}
            </div>
          )}
        </>
      )}

      {data.tenant.invoiceTermsText && (
        <>
          <Divider />
          {/* Its own labelled block rather than another footer line: a
              returns policy and a jurisdiction clause are terms, and a
              customer disputing a bill should be able to point at them. */}
          <div className="text-[9px]">
            <div className="font-bold">Terms &amp; Conditions</div>
            {wide ? (
              <div>
                {data.tenant.invoiceTermsText
                  .split("|")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .join("  ·  ")}
              </div>
            ) : (
              <div className="space-y-0.5">
                {data.tenant.invoiceTermsText
                  .split("|")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((t, i) => (
                    <div key={i}>{t}</div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 border-t border-dashed border-black/40" />;
}

function Row({ children, cols }: { children: React.ReactNode; cols: number[] }) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: cols.map((c) => `${c}fr`).join(" ") }}
    >
      {children}
    </div>
  );
}
