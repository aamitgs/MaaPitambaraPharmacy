"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { runEinvoiceAttempt, runEwayBillAttemptForInvoice, runEwayBillAttemptForGrn } from "@/lib/gsp/engine";

async function assertInvoiceInTenant(invoiceId: string, tenantId: string) {
  const invoice = await prisma.salesInvoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!invoice) throw new Error("Invoice not found");
}

async function assertGrnInTenant(grnId: string, tenantId: string) {
  const grn = await prisma.grn.findFirst({ where: { id: grnId, tenantId } });
  if (!grn) throw new Error("GRN not found");
}

export async function retryEinvoice(invoiceId: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  await assertInvoiceInTenant(invoiceId, session.user.tenantId);
  const result = await runEinvoiceAttempt(invoiceId);
  revalidatePath(`/invoices/${invoiceId}/receipt`);
  return result;
}

export async function retryEwayBillForInvoice(invoiceId: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  await assertInvoiceInTenant(invoiceId, session.user.tenantId);
  const result = await runEwayBillAttemptForInvoice(invoiceId);
  revalidatePath(`/invoices/${invoiceId}/receipt`);
  return result;
}

export async function retryEwayBillForGrn(grnId: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  await assertGrnInTenant(grnId, session.user.tenantId);
  const result = await runEwayBillAttemptForGrn(grnId);
  revalidatePath(`/grn/${grnId}`);
  return result;
}
