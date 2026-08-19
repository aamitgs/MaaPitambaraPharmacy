import type { CartLine } from "@/store/cart-store";
import type { PosItem, PosCustomer, PosDoctor } from "@/components/pos/types";
import type { BillingResult } from "@/lib/billing";
import type { PaymentMode } from "@/generated/prisma/client";
import type { ReceiptHeader } from "./db";

/**
 * Builds a ReceiptData-shaped object entirely from data already in the
 * browser (cart, catalog, the already-computed client-side billing, and
 * the cached branch/tenant header) — no server round-trip. This is what
 * lets printing work for a sale that's still sitting in the offline queue.
 */
export function buildOfflineReceiptData(params: {
  localId: string;
  invoiceNo: string;
  lines: CartLine[];
  catalogByItemId: Map<string, PosItem>;
  billing: BillingResult;
  paymentMode: PaymentMode;
  customer: PosCustomer | null;
  doctor: PosDoctor | null;
  patientName: string;
  patientAge: string;
  patientPhone: string;
  patientAddress: string;
  header: ReceiptHeader;
}) {
  const { lines, catalogByItemId, billing, header } = params;

  return {
    id: params.localId,
    invoiceNo: params.invoiceNo,
    invoiceDate: new Date(),
    paymentMode: params.paymentMode,
    status: "completed" as const,
    subtotal: billing.subtotal,
    taxAmount: billing.taxAmount,
    discountAmount: billing.discountAmount,
    total: billing.total,
    roundOffAmount: billing.roundOff,
    patientName: params.patientName || null,
    patientAge: params.patientAge ? Number(params.patientAge) : null,
    patientPhone: params.patientPhone || null,
    patientAddress: params.patientAddress || null,
    customer: params.customer ? { id: params.customer.id, name: params.customer.name, phone: params.customer.phone } : null,
    einvoiceIrn: null,
    einvoiceAckNo: null,
    einvoiceQrImageDataUrl: null,
    // Generated server-side; an offline bill prints without it and gains
    // one when the queued sale syncs and the real receipt is reprinted.
    invoiceQrImageDataUrl: null,
    ewayBillNo: null,
    einvoiceEnabled: false,
    ewayBillThreshold: Infinity,
    doctor: params.doctor
      ? {
          name: params.doctor.name,
          registrationNo: params.doctor.registrationNo,
          phone: params.doctor.phone ?? null,
        }
      : null,
    branch: header.branch ?? {
      name: "—",
      licensedAddress: "",
      phone: null,
      landline: null,
      gstin: null,
      drugLicenseRetailNo: null,
      drugLicenseWholesaleNo: null,
      fssaiNo: null,
      pharmacistName: null,
      pharmacistRegistrationNo: null,
    },
    tenant: header.tenant,
    prescriptionImageUrl: null,
    pharmacistSignoff: null,
    items: lines.map((line, i) => {
      const catalogItem = catalogByItemId.get(line.itemId);
      const lineBilling = billing.lines[i];
      return {
        id: line.lineId,
        itemName: line.itemName,
        manufacturer: line.manufacturer,
        hsnCode: catalogItem?.hsnCode ?? null,
        packSize: catalogItem?.packSize ?? null,
        batchNo: line.batchNo,
        expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
        // The cart line carries no MRP — the batch picker works off sale
        // rate — so an offline bill leaves the column blank rather than
        // guessing a price the customer can read.
        mrp: null as number | null,
        qty: line.qty,
        rate: line.rate,
        taxRate: line.taxRate,
        discountAmount: lineBilling.itemDiscountAmount + lineBilling.schemeDiscountAmount + lineBilling.billDiscountShare,
        cgstAmount: lineBilling.cgst,
        sgstAmount: lineBilling.sgst,
        lineTotal: lineBilling.lineTotal,
      };
    }),
  };
}
