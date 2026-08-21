"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

/**
 * One log across every channel.
 *
 * WhatsApp, SMS and email each kept their own table, which is right —
 * they have genuinely different fields, and merging them into one polymorphic
 * table would have meant a column that is a phone number two-thirds of the
 * time and an address the rest. But "did this customer get their bill?" is
 * a single question, and answering it by opening three screens is how it
 * goes unanswered.
 *
 * So the tables stay separate and the *view* is merged here.
 */

export type CommChannel = "whatsapp" | "sms" | "email";

export type CommEntry = {
  id: string;
  channel: CommChannel;
  recipient: string;
  messageType: string;
  status: string;
  /** True for anything that did not reach the recipient. */
  failed: boolean;
  note: string | null;
  sentAt: string;
  invoiceId: string | null;
  invoiceNo: string | null;
  customerName: string | null;
};

const filterSchema = z.object({
  channel: z.enum(["all", "whatsapp", "sms", "email"]).default("all"),
  status: z.enum(["all", "failed"]).default("all"),
  invoiceId: z.string().optional(),
  customerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function listCommunications(input: Partial<z.infer<typeof filterSchema>> = {}) {
  const session = await requirePermission("customers.manage");
  const tenantId = session.user.tenantId;
  const f = filterSchema.parse(input);

  const scope = {
    tenantId,
    ...(f.invoiceId ? { invoiceId: f.invoiceId } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
  };
  const include = {
    invoice: { select: { id: true, invoiceNo: true } },
    customer: { select: { name: true } },
  } as const;

  // Each channel is over-fetched to `limit` and the merged list trimmed
  // after sorting — otherwise a chatty channel could crowd the others out
  // of the window entirely.
  const [whatsapp, sms, email] = await Promise.all([
    f.channel === "all" || f.channel === "whatsapp"
      ? prisma.whatsAppLog.findMany({
          where: scope,
          orderBy: { sentAt: "desc" },
          take: f.limit,
          include,
        })
      : [],
    f.channel === "all" || f.channel === "sms"
      ? prisma.smsLog.findMany({
          where: scope,
          orderBy: { sentAt: "desc" },
          take: f.limit,
          include,
        })
      : [],
    f.channel === "all" || f.channel === "email"
      ? prisma.emailLog.findMany({
          where: scope,
          orderBy: { sentAt: "desc" },
          take: f.limit,
          include,
        })
      : [],
  ]);

  const entries: CommEntry[] = [
    ...whatsapp.map((l) => ({
      id: `wa-${l.id}`,
      channel: "whatsapp" as const,
      recipient: l.phone,
      messageType: l.messageType,
      status: l.status,
      // handed_off means the app could not send it — a staff member was
      // handed a link instead — so it is not a delivery.
      failed: l.status !== "sent",
      note: l.note,
      sentAt: l.sentAt.toISOString(),
      invoiceId: l.invoice?.id ?? null,
      invoiceNo: l.invoice?.invoiceNo ?? null,
      customerName: l.customer?.name ?? null,
    })),
    ...sms.map((l) => ({
      id: `sms-${l.id}`,
      channel: "sms" as const,
      recipient: l.phone,
      messageType: l.messageType,
      status: l.status,
      failed: l.status !== "sent",
      note: l.note,
      sentAt: l.sentAt.toISOString(),
      invoiceId: l.invoice?.id ?? null,
      invoiceNo: l.invoice?.invoiceNo ?? null,
      customerName: l.customer?.name ?? null,
    })),
    ...email.map((l) => ({
      id: `em-${l.id}`,
      channel: "email" as const,
      recipient: l.toAddress,
      messageType: l.messageType,
      status: l.status,
      failed: l.status !== "sent",
      note: l.note,
      sentAt: l.sentAt.toISOString(),
      invoiceId: l.invoice?.id ?? null,
      invoiceNo: l.invoice?.invoiceNo ?? null,
      customerName: l.customer?.name ?? null,
    })),
  ];

  const filtered = f.status === "failed" ? entries.filter((e) => e.failed) : entries;
  filtered.sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  return {
    entries: filtered.slice(0, f.limit),
    totalShown: Math.min(filtered.length, f.limit),
    failedCount: entries.filter((e) => e.failed).length,
  };
}
