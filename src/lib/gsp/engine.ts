import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { generateEinvoice, generateEwayBill, type EinvoiceResult, type EwayBillResult } from "./provider";

/**
 * Plain internal functions (no "use server", no session) so they can run
 * both as a fire-and-forget background attempt right after a sale/GRN
 * commits, and from an authenticated manual-retry server action — neither
 * caller needs to thread a session through here.
 */

export async function runEinvoiceAttempt(invoiceId: string): Promise<EinvoiceResult> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: { branch: true, customer: true, items: { include: { item: true } } },
  });
  if (!invoice) return { success: false, note: "Invoice not found." };
  if (invoice.einvoiceIrn) return { success: true, irn: invoice.einvoiceIrn, ackNo: invoice.einvoiceAckNo ?? undefined, qrData: invoice.einvoiceQrData ?? undefined };
  if (!invoice.branch.einvoiceEnabled) {
    return { success: false, note: "E-invoicing is not enabled for this branch." };
  }

  const result = await generateEinvoice({
    invoiceNo: invoice.invoiceNo,
    invoiceDate: format(invoice.invoiceDate, "dd/MM/yyyy"),
    sellerGstin: invoice.branch.gstin ?? "",
    buyerGstin: undefined,
    buyerName: invoice.customer?.name,
    totalValue: Number(invoice.total),
    items: invoice.items.map((l) => ({
      name: l.item.name,
      hsnCode: l.item.hsnCode ?? "",
      qty: l.qty,
      unitPrice: Number(l.rate),
      taxRate: Number(l.taxRate),
    })),
  });

  if (result.success) {
    await prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { einvoiceIrn: result.irn, einvoiceAckNo: result.ackNo, einvoiceQrData: result.qrData },
    });
  }

  return result;
}

export async function runEwayBillAttemptForInvoice(invoiceId: string): Promise<EwayBillResult> {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: { branch: true },
  });
  if (!invoice) return { success: false, note: "Invoice not found." };
  if (invoice.ewayBillNo) return { success: true, ewayBillNo: invoice.ewayBillNo };
  if (Number(invoice.total) < Number(invoice.branch.ewayBillThreshold)) {
    return { success: false, note: "Below this branch's e-way bill value threshold." };
  }

  const result = await generateEwayBill({
    documentNo: invoice.invoiceNo,
    documentDate: format(invoice.invoiceDate, "dd/MM/yyyy"),
    sellerGstin: invoice.branch.gstin ?? "",
    totalValue: Number(invoice.total),
  });

  if (result.success) {
    await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { ewayBillNo: result.ewayBillNo } });
  }

  return result;
}

export async function runEwayBillAttemptForGrn(grnId: string): Promise<EwayBillResult> {
  const grn = await prisma.grn.findUnique({
    where: { id: grnId },
    include: { branch: true, items: true },
  });
  if (!grn) return { success: false, note: "GRN not found." };
  if (grn.ewayBillNo) return { success: true, ewayBillNo: grn.ewayBillNo };

  const total = grn.items.reduce((sum, i) => sum + i.qty * Number(i.rate), 0);
  if (total < Number(grn.branch.ewayBillThreshold)) {
    return { success: false, note: "Below this branch's e-way bill value threshold." };
  }

  const result = await generateEwayBill({
    documentNo: grn.supplierInvoiceNo,
    documentDate: format(grn.supplierInvoiceDate, "dd/MM/yyyy"),
    sellerGstin: grn.branch.gstin ?? "",
    totalValue: total,
  });

  if (result.success) {
    await prisma.grn.update({ where: { id: grnId }, data: { ewayBillNo: result.ewayBillNo } });
  }

  return result;
}
