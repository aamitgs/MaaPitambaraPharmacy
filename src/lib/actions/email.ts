"use server";

import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getInvoiceForReceipt } from "@/lib/actions/invoices";
import { getCustomerStatement } from "@/lib/actions/customers";
import { sendEmailMessage, type EmailSendResult } from "@/lib/email/provider";
import { z } from "zod";

const sendSchema = z.object({ email: z.string().email("Enter a valid email address") });

async function logAndReturn(params: {
  tenantId: string;
  customerId: string | null;
  invoiceId: string | null;
  toAddress: string;
  messageType: "receipt" | "statement";
  result: EmailSendResult;
}) {
  await prisma.emailLog.create({
    data: {
      tenantId: params.tenantId,
      customerId: params.customerId,
      invoiceId: params.invoiceId,
      toAddress: params.toAddress,
      messageType: params.messageType,
      // A mailto hand-off is neither sent nor failed: the message left the
      // app but only the person at the counter can complete it.
      status: params.result.success
        ? "sent"
        : params.result.handoffUrl
          ? "handed_off"
          : "failed",
      note: params.result.note,
    },
  });
  return params.result;
}

/**
 * Sends the same itemised text summary WhatsApp does. There is still no
 * server-side document rendering in this app, so this is not a PDF of the
 * bill — see the WhatsApp note in the README.
 */
export async function sendReceiptEmail(invoiceId: string, emailOverride?: string) {
  const session = await requireSession();
  const invoice = await getInvoiceForReceipt(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  const parsed = sendSchema.parse({ email: emailOverride || "" });

  const lines = invoice.items.map((l) => `${l.itemName} x${l.qty} — ₹${l.lineTotal.toFixed(2)}`);
  const text = [
    invoice.tenant.pharmacyName,
    `Invoice ${invoice.invoiceNo} — ${format(new Date(invoice.invoiceDate), "dd MMM yyyy")}`,
    "",
    ...lines,
    "",
    `Subtotal: ₹${invoice.subtotal.toFixed(2)}`,
    ...(invoice.discountAmount > 0 ? [`Discount: -₹${invoice.discountAmount.toFixed(2)}`] : []),
    `Tax: ₹${invoice.taxAmount.toFixed(2)}`,
    ...(invoice.roundOffAmount !== 0
      ? [`Round off: ${invoice.roundOffAmount < 0 ? "-" : "+"}₹${Math.abs(invoice.roundOffAmount).toFixed(2)}`]
      : []),
    `Total: ₹${invoice.total.toFixed(2)}`,
    "",
    "Thank you for your purchase!",
  ].join("\n");

  const result = await sendEmailMessage({
    to: parsed.email,
    subject: `${invoice.tenant.pharmacyName} — Invoice ${invoice.invoiceNo}`,
    text,
  });

  const outcome = await logAndReturn({
    tenantId: session.user.tenantId,
    customerId: invoice.customer?.id ?? null,
    invoiceId: invoice.id,
    toAddress: parsed.email,
    messageType: "receipt",
    result,
  });

  revalidatePath(`/invoices/${invoiceId}/receipt`);
  return outcome;
}

/** Same delivery mechanism as the receipt — a text summary, not an attachment. */
export async function sendStatementEmail(
  customerId: string,
  from: string,
  to: string,
  emailOverride?: string
) {
  const session = await requireSession();
  const statement = await getCustomerStatement(customerId, from, to);
  const parsed = sendSchema.parse({ email: emailOverride || "" });

  const text = [
    "Statement of Account",
    `${statement.customerName} — ${format(new Date(from), "dd MMM yyyy")} to ${format(new Date(to), "dd MMM yyyy")}`,
    "",
    `Opening balance: ₹${statement.openingBalance.toFixed(2)}`,
    ...statement.lines.map(
      (l) =>
        `${format(new Date(l.date), "dd MMM")} — ${l.description}: ${
          l.debit > 0 ? `+₹${l.debit.toFixed(2)}` : `-₹${l.credit.toFixed(2)}`
        }`
    ),
    "",
    `Closing balance: ₹${statement.closingBalance.toFixed(2)}`,
  ].join("\n");

  const result = await sendEmailMessage({
    to: parsed.email,
    subject: `Statement of Account — ${statement.customerName}`,
    text,
  });

  const outcome = await logAndReturn({
    tenantId: session.user.tenantId,
    customerId,
    invoiceId: null,
    toAddress: parsed.email,
    messageType: "statement",
    result,
  });

  revalidatePath(`/customers/${customerId}/statement`);
  return outcome;
}
