import "server-only";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/branding";
import QRCode from "qrcode";
import type { Prisma } from "@/generated/prisma/client";
import { splitCgstSgst } from "@/lib/billing";

/**
 * Builds everything a bill needs to render, from a single invoice.
 *
 * Deliberately NOT in a `"use server"` module: it takes a raw `where`, and
 * anything exported from a server-action file is callable by the browser.
 * A client that could pass its own filter here could read any invoice in
 * the database. The two callers — the authenticated receipt action and the
 * public token page — each apply their own scoping before calling in.
 */

export async function buildReceiptData(where: Prisma.SalesInvoiceWhereInput) {
  const invoice = await prisma.salesInvoice.findFirst({
    where,
    include: {
      branch: true,
      customer: true,
      doctor: true,
      pharmacistSignoff: { select: { name: true } },
      items: {
        include: { item: true, batch: true },
      },
    },
  });
  if (!invoice) return null;

  // Everything printed on a bill that is not per-invoice comes from
  // branding — name, logo, header/footer, terms and the UPI payee.
  const branding = await getBranding();

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    paymentMode: invoice.paymentMode,
    status: invoice.status,
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    discountAmount: Number(invoice.discountAmount),
    total: Number(invoice.total),
    roundOffAmount: Number(invoice.roundOffAmount),
    patientName: invoice.patientName,
    patientAge: invoice.patientAge,
    patientPhone: invoice.patientPhone,
    patientAddress: invoice.patientAddress,
    customer: invoice.customer
      ? { id: invoice.customer.id, name: invoice.customer.name, phone: invoice.customer.phone }
      : null,
    einvoiceIrn: invoice.einvoiceIrn,
    einvoiceAckNo: invoice.einvoiceAckNo,
    einvoiceQrImageDataUrl: invoice.einvoiceQrData
      ? await QRCode.toDataURL(invoice.einvoiceQrData).catch(() => null)
      : null,
    // A UPI "scan & pay" QR carrying the exact bill amount, so the patient
    // doesn't key it in. Any UPI app (GPay, PhonePe, Paytm, BHIM) reads
    // this standard deep link; `tn` puts the invoice number on the payer's
    // statement so a payment can be matched back to a bill.
    invoiceQrImageDataUrl: await QRCode.toDataURL(
      "upi://pay?" +
        new URLSearchParams({
          pa: branding.contact.upiId,
          pn: branding.name,
          am: Number(invoice.total).toFixed(2),
          cu: "INR",
          tn: invoice.invoiceNo,
        }).toString(),
      { margin: 1, width: 200 }
    ).catch(() => null),
    ewayBillNo: invoice.ewayBillNo,
    einvoiceEnabled: invoice.branch.einvoiceEnabled,
    ewayBillThreshold: Number(invoice.branch.ewayBillThreshold),
    doctor: invoice.doctor
      ? {
          name: invoice.doctor.name,
          registrationNo: invoice.doctor.registrationNo,
          phone: invoice.doctor.phone,
        }
      : null,
    branch: {
      name: invoice.branch.name,
      licensedAddress: invoice.branch.licensedAddress,
      phone: invoice.branch.phone,
      landline: invoice.branch.landline,
      gstin: invoice.branch.gstin,
      drugLicenseRetailNo: invoice.branch.drugLicenseRetailNo,
      drugLicenseWholesaleNo: invoice.branch.drugLicenseWholesaleNo,
      fssaiNo: invoice.branch.fssaiNo,
      pharmacistName: invoice.branch.pharmacistName,
      pharmacistRegistrationNo: invoice.branch.pharmacistRegistrationNo,
    },
    tenant: {
      pharmacyName: branding.name,
      invoiceHeaderText: branding.invoice.headerText,
      invoiceFooterText: branding.invoice.footerText,
      invoiceTermsText: branding.invoice.termsText,
      logoHorizontal: branding.logo.horizontal,
      logoIcon: branding.logo.icon,
      showLogo: branding.invoice.showLogo,
      paperDefault: branding.invoice.paperDefault,
    },
    prescriptionImageUrl: invoice.prescriptionImageUrl,
    pharmacistSignoff: invoice.pharmacistSignoff
      ? { name: invoice.pharmacistSignoff.name, at: invoice.pharmacistSignoffAt }
      : null,
    // Intra-state assumption (CGST = SGST = half the line's tax) matches the
    // convention already established in src/lib/billing.ts's computeBilling
    // — same split, just re-derived here for display since SalesInvoiceItem
    // only stores the combined taxRate, not separate cgst/sgst columns.
    items: invoice.items.map((line) => {
      const qty = line.qty;
      const rate = Number(line.rate);
      const discountAmount = Number(line.discountAmount);
      const taxRate = Number(line.taxRate);
      const taxableValue = qty * rate - discountAmount;
      const taxAmount = (taxableValue * taxRate) / 100;
      const { cgst: cgstAmount, sgst: sgstAmount } = splitCgstSgst(taxAmount);
      return {
        id: line.id,
        itemName: line.item.name,
        manufacturer: line.item.manufacturer,
        hsnCode: line.item.hsnCode,
        packSize: line.item.packSize,
        isLooseSale: line.isLooseSale,
        priceBasis: line.priceBasis,
        unitsPerPack: line.unitsPerPack,
        unit: line.item.unit,
        batchNo: line.batch.batchNo,
        // Widened to nullable so the offline receipt, which has no MRP in
        // the cart line, satisfies the same ReceiptData shape. Always
        // present on a server-rendered bill.
        expiryDate: line.batch.expiryDate as Date | null,
        mrp: Number(line.batch.mrp) as number | null,
        qty,
        rate,
        taxRate,
        discountAmount,
        cgstAmount,
        sgstAmount,
        lineTotal: taxableValue + taxAmount,
      };
    }),
  };
}
