"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { sendWhatsAppMessage, type WhatsAppSendResult } from "@/lib/whatsapp/provider";
import { getInvoiceForReceipt } from "@/lib/actions/invoices";
import { getCustomerStatement } from "@/lib/actions/customers";

type MessageType = "receipt" | "statement" | "reminder";

async function logAndReturn(params: {
  tenantId: string;
  customerId: string | null;
  invoiceId: string | null;
  phone: string;
  messageType: MessageType;
  result: WhatsAppSendResult;
}) {
  await prisma.whatsAppLog.create({
    data: {
      tenantId: params.tenantId,
      customerId: params.customerId,
      invoiceId: params.invoiceId,
      phone: params.phone,
      messageType: params.messageType,
      // A wa.me hand-off is neither sent nor failed: the message left the
      // app but only the staff member can complete it.
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

const sendSchema = z.object({
  phone: z.string().trim().min(1, "Phone number is required"),
});

/**
 * Sends a text-based receipt summary — not an actual PDF/image attachment.
 * This app's other "PDF" exports (narcotic register, reports) are all
 * browser print-to-PDF, not server-rendered files, so there's no existing
 * document-rendering pipeline to attach a binary receipt to WhatsApp with;
 * building one (headless rendering, media hosting for Gupshup's document
 * API) is a real follow-up, not something to fake here. The itemized text
 * summary is what actually ships.
 */
export async function sendReceiptWhatsApp(invoiceId: string, phoneOverride?: string) {
  const session = await requireSession();
  const invoice = await getInvoiceForReceipt(invoiceId);
  if (!invoice) throw new Error("Invoice not found");

  const parsed = sendSchema.parse({ phone: phoneOverride || invoice.customer?.phone || "" });

  const lines = invoice.items.map((l) => `${l.itemName} x${l.qty} — ₹${l.lineTotal.toFixed(2)}`);
  const text = [
    `*${invoice.tenant.pharmacyName}*`,
    `Invoice ${invoice.invoiceNo} — ${format(new Date(invoice.invoiceDate), "dd MMM yyyy")}`,
    "",
    ...lines,
    "",
    `Subtotal: ₹${invoice.subtotal.toFixed(2)}`,
    ...(invoice.discountAmount > 0 ? [`Discount: -₹${invoice.discountAmount.toFixed(2)}`] : []),
    `Tax: ₹${invoice.taxAmount.toFixed(2)}`,
    `*Total: ₹${invoice.total.toFixed(2)}*`,
    "",
    "Thank you for your purchase!",
  ].join("\n");

  const result = await sendWhatsAppMessage({ to: parsed.phone, text });

  const outcome = await logAndReturn({
    tenantId: session.user.tenantId,
    customerId: invoice.customer?.id ?? null,
    invoiceId: invoice.id,
    phone: parsed.phone,
    messageType: "receipt",
    result,
  });

  revalidatePath(`/invoices/${invoiceId}/receipt`);
  return outcome;
}

/** Same delivery mechanism as the receipt — a text summary, not a PDF attachment. */
export async function sendStatementWhatsApp(
  customerId: string,
  from: string,
  to: string,
  phoneOverride?: string
) {
  const session = await requireSession();
  const statement = await getCustomerStatement(customerId, from, to);

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: session.user.tenantId },
  });
  if (!customer) throw new Error("Customer not found");

  const parsed = sendSchema.parse({ phone: phoneOverride || customer.phone || "" });

  const text = [
    `*Statement of Account*`,
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
    `*Closing balance: ₹${statement.closingBalance.toFixed(2)}*`,
  ].join("\n");

  const result = await sendWhatsAppMessage({ to: parsed.phone, text });

  return logAndReturn({
    tenantId: session.user.tenantId,
    customerId,
    invoiceId: null,
    phone: parsed.phone,
    messageType: "statement",
    result,
  });
}

export async function listWhatsAppLogsForInvoice(invoiceId: string) {
  const session = await requireSession();
  const logs = await prisma.whatsAppLog.findMany({
    where: { invoiceId, tenantId: session.user.tenantId },
    orderBy: { sentAt: "desc" },
  });
  return logs;
}
