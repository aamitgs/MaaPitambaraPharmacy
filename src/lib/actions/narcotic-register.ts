"use server";

import { z } from "zod";
import { localDateWindow } from "@/lib/date-range";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { getBranchFilter } from "@/lib/branch-scope";

/**
 * Owner/Pharmacist only — this is compliance data reviewed under audit
 * pressure, not something Counter Staff needs day-to-day. Branch-scoped by
 * default: a narcotic register is a bound, per-premises document in real
 * regulatory practice, so an inspector at one branch expects that branch's
 * entries, not every branch mixed together. Owner can switch to "all
 * branches" for a tenant-wide view.
 */
export async function listNarcoticRegisterEntries(from: string, to: string) {
  const session = await requirePermission("compliance.manage");
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);

  const { fromDate, toDate } = localDateWindow(from, to);

  const entries = await prisma.narcoticRegisterEntry.findMany({
    where: { tenantId: session.user.tenantId, ...branchFilter, dispensedAt: { gte: fromDate, lte: toDate } },
    include: {
      item: { select: { name: true, unit: true } },
      batch: { select: { batchNo: true } },
      doctor: { select: { name: true, registrationNo: true } },
      dispensedBy: { select: { name: true } },
      invoice: { select: { invoiceNo: true } },
      reversedBy: { select: { id: true } },
    },
    // Chronological, oldest first — a bound narcotic register is read top
    // to bottom in the order entries were made, not most-recent-first like
    // the app's other list screens.
    orderBy: { dispensedAt: "asc" },
  });

  return entries.map((e) => ({
    id: e.id,
    dispensedAt: e.dispensedAt,
    itemName: e.item.name,
    unit: e.item.unit,
    batchNo: e.batch.batchNo,
    qty: e.qty,
    doctorName: e.doctor?.name ?? null,
    doctorRegistrationNo: e.doctor?.registrationNo ?? null,
    patientName: e.patientName,
    dispensedByName: e.dispensedBy.name,
    invoiceNo: e.invoice.invoiceNo,
    invoiceId: e.invoiceId,
    isReversal: e.reversalOfId !== null,
    reversalOfId: e.reversalOfId,
    hasReversal: e.reversedBy !== null,
  }));
}

const reversalSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required"),
});

export type NarcoticReversalInput = z.infer<typeof reversalSchema>;

/**
 * Register-level correction only — does not touch Batch.currentQty or the
 * originating SalesInvoice. If the underlying sale itself needs to be
 * undone, that's a separate concern from correcting what was logged in
 * this tamper-evident register.
 */
export async function createNarcoticReversal(originalEntryId: string, input: NarcoticReversalInput) {
  const session = await requirePermission("compliance.manage");
  const parsed = reversalSchema.parse(input);

  const original = await prisma.narcoticRegisterEntry.findFirst({
    where: { id: originalEntryId, tenantId: session.user.tenantId },
    include: { reversedBy: true },
  });
  if (!original) throw new Error("Register entry not found");
  if (original.reversalOfId) throw new Error("Cannot reverse a reversal entry");
  if (original.reversedBy) throw new Error("This entry has already been reversed");

  const reversal = await prisma.narcoticRegisterEntry.create({
    data: {
      tenantId: session.user.tenantId,
      branchId: original.branchId,
      invoiceId: original.invoiceId,
      itemId: original.itemId,
      batchId: original.batchId,
      qty: original.qty,
      doctorId: original.doctorId,
      patientName: original.patientName,
      dispensedByUserId: session.user.id,
      reversalOfId: original.id,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "narcotic_register.reversal",
    entity: "NarcoticRegisterEntry",
    entityId: reversal.id,
    before: { originalEntryId: original.id },
    after: { reason: parsed.reason },
  });

  revalidatePath("/reports/narcotic-register");
  return { id: reversal.id };
}
