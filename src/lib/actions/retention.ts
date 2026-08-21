"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { planRedaction, REDACTED, MINIMUM_RETENTION_YEARS } from "@/lib/retention";

export type RetentionPreview = {
  years: number;
  cutoff: Date | null;
  eligible: number;
  /// Of those, how many carry a prescription — the ones a pharmacist may
  /// want to think twice about, since the image goes too.
  withPrescription: number;
  oldestWithDetails: Date | null;
  blockedReason: string | null;
};

/**
 * What a redaction run would affect, without doing it.
 *
 * Shown before anything is cleared because this is not reversible and the
 * owner is entitled to see the size of it first.
 */
export async function previewRetention(years: number): Promise<RetentionPreview> {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;
  const plan = planRedaction(years);

  if (!plan.redact) {
    return {
      years, cutoff: null, eligible: 0, withPrescription: 0,
      oldestWithDetails: null, blockedReason: plan.reason,
    };
  }

  const where = {
    tenantId,
    invoiceDate: { lt: plan.cutoff },
    OR: [
      { patientName: { not: null } },
      { patientPhone: { not: null } },
      { patientAddress: { not: null } },
      { patientAge: { not: null } },
      { prescriptionImageUrl: { not: null } },
    ],
  };

  const [eligible, withPrescription, oldest] = await Promise.all([
    prisma.salesInvoice.count({ where }),
    prisma.salesInvoice.count({ where: { ...where, prescriptionImageUrl: { not: null } } }),
    prisma.salesInvoice.findFirst({
      where: {
        tenantId,
        OR: where.OR,
      },
      orderBy: { invoiceDate: "asc" },
      select: { invoiceDate: true },
    }),
  ]);

  return {
    years,
    cutoff: plan.cutoff,
    eligible,
    withPrescription,
    oldestWithDetails: oldest?.invoiceDate ?? null,
    blockedReason: null,
  };
}

/**
 * Clears patient details from invoices older than the retention window.
 *
 * The invoice itself is untouched — number, date, lines, totals, tax and
 * customer account all survive, so every accounting and GST report reads
 * exactly the same afterwards. What goes is the identity of a person who
 * bought medicine years ago and whose details nothing requires any more.
 *
 * The prescription image reference is cleared with the rest. The file on
 * disk is left for the operator to remove alongside their own backups —
 * deleting it from here would make a restore of yesterday's backup
 * inconsistent with today's database.
 */
export async function runRetention(years: number) {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;
  const plan = planRedaction(years);
  if (!plan.redact) throw new Error(plan.reason);

  const { count } = await prisma.salesInvoice.updateMany({
    where: {
      tenantId,
      invoiceDate: { lt: plan.cutoff },
      OR: [
        { patientName: { not: null } },
        { patientPhone: { not: null } },
        { patientAddress: { not: null } },
        { patientAge: { not: null } },
        { prescriptionImageUrl: { not: null } },
      ],
    },
    data: {
      patientName: REDACTED,
      patientAge: null,
      patientPhone: null,
      patientAddress: null,
      prescriptionImageUrl: null,
    },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "retention.redact",
    entity: "SalesInvoice",
    entityId: tenantId,
    after: {
      retainedYears: years,
      cutoff: plan.cutoff.toISOString(),
      invoicesRedacted: count,
      statutoryMinimumYears: MINIMUM_RETENTION_YEARS,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/invoices");
  return { count, cutoff: plan.cutoff };
}
