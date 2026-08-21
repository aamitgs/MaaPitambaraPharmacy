"use server";

import { z } from "zod";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getBranding } from "@/lib/branding";
import { sendSms, isValidIndianMobile } from "@/lib/sms/provider";
import { ensurePublicToken, publicBillUrl, isPublicBillConfigured } from "@/lib/public-bill";
import type { SmsTemplateKey } from "@/lib/sms/templates";

/**
 * Sending a bill by SMS.
 *
 * An SMS cannot carry a PDF, so "send the invoice" means a short message
 * with the key figures plus a link to the customer's own copy. Which of
 * the two registered templates is used depends on whether a public base
 * URL is configured — a link template with no URL to put in it would be
 * rejected by the operator as a template mismatch.
 */

const schema = z.object({
  invoiceId: z.string().min(1),
  phone: z.string().trim().min(1, "Enter a mobile number"),
});

export async function sendReceiptSms(input: z.infer<typeof schema>) {
  const session = await requirePermission("sales.sell");
  const tenantId = session.user.tenantId;
  const parsed = schema.parse(input);

  if (!isValidIndianMobile(parsed.phone)) {
    return {
      success: false as const,
      note: "That is not a 10-digit Indian mobile number — SMS cannot go to a landline.",
    };
  }

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: parsed.invoiceId, tenantId },
    select: {
      id: true,
      invoiceNo: true,
      invoiceDate: true,
      total: true,
      status: true,
      customerId: true,
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "completed") {
    return { success: false as const, note: "That bill is cancelled — there is nothing to send." };
  }

  const branding = await getBranding();
  const useLink = isPublicBillConfigured();
  const templateKey: SmsTemplateKey = useLink ? "receiptWithLink" : "receipt";

  const values = [
    invoice.invoiceNo,
    Number(invoice.total).toFixed(2),
    format(invoice.invoiceDate, "dd/MM/yyyy"),
  ];
  if (useLink) {
    values.push(publicBillUrl(await ensurePublicToken(invoice.id, tenantId)));
  }
  values.push(branding.name);

  const result = await sendSms(parsed.phone, templateKey, values);

  await prisma.smsLog.create({
    data: {
      tenantId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      phone: parsed.phone,
      messageType: "receipt",
      status: result.success ? "sent" : "failed",
      note: result.note ?? null,
      templateKey,
    },
  });

  return {
    success: result.success,
    note: result.note,
    text: result.text,
    segments: result.segments,
  };
}

export async function listSmsLogsForInvoice(invoiceId: string) {
  const session = await requirePermission("sales.sell");
  const logs = await prisma.smsLog.findMany({
    where: { invoiceId, tenantId: session.user.tenantId },
    orderBy: { sentAt: "desc" },
    take: 10,
  });
  return logs.map((l) => ({
    id: l.id,
    phone: l.phone,
    status: l.status,
    note: l.note,
    sentAt: l.sentAt.toISOString(),
  }));
}
