"use server";

import { prisma } from "@/lib/prisma";
import { localDateWindow } from "@/lib/date-range";
import { requirePermission } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";

/**
 * Schedule H / H1 dispensing register.
 *
 * Rule 65(11A) of the Drugs and Cosmetics Rules requires a *separate*
 * register for Schedule H1 drugs, kept for three years and open to
 * inspection, carrying: serial number, date of supply, patient's name and
 * address, prescriber's name and address, drug name, and quantity supplied.
 *
 * Derived from the sales invoices rather than written to its own table, on
 * purpose. The narcotic (Schedule X) register has its own rows because it
 * needs correction entries that stand beside the original; an H1 register
 * has no such requirement, and deriving it means it can never drift from
 * what was actually billed — including cancelled bills dropping out of the
 * register automatically, which a duplicated table would get wrong.
 */

export type ScheduleRegisterRow = {
  serial: number;
  date: Date;
  invoiceNo: string;
  branchName: string;
  scheduleClass: string;
  itemName: string;
  batchNo: string;
  qty: number;
  unit: string;
  patientName: string | null;
  patientAddress: string | null;
  patientPhone: string | null;
  doctorName: string | null;
  doctorRegistrationNo: string | null;
  doctorClinic: string | null;
  prescriptionImageUrl: string | null;
  dispensedBy: string | null;
  /** Set when a required field is missing — an incomplete register entry. */
  gaps: string[];
};

export async function getScheduleHRegister(
  from: string,
  to: string,
  scope: "H1" | "H_AND_H1" = "H1"
): Promise<ScheduleRegisterRow[]> {
  const session = await requirePermission("compliance.manage");
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);

  const { fromDate, toDate } = localDateWindow(from, to);

  const classes = scope === "H1" ? ["H1"] : ["H", "H1"];

  const lines = await prisma.salesInvoiceItem.findMany({
    where: {
      item: { scheduleClass: { in: classes as ("H" | "H1")[] } },
      invoice: {
        tenantId: session.user.tenantId,
        ...branchFilter,
        // A cancelled bill is not a supply, so it must not appear in a
        // statutory register.
        status: "completed",
        invoiceDate: { gte: fromDate, lte: toDate },
      },
    },
    include: {
      item: { select: { name: true, unit: true, scheduleClass: true } },
      batch: { select: { batchNo: true } },
      invoice: {
        select: {
          invoiceNo: true,
          invoiceDate: true,
          patientName: true,
          patientAddress: true,
          patientPhone: true,
          prescriptionImageUrl: true,
          branch: { select: { name: true } },
          doctor: { select: { name: true, registrationNo: true, clinicName: true } },
          pharmacistSignoff: { select: { name: true } },
        },
      },
    },
    // Oldest first: a register is read top to bottom in the order supplies
    // were made, not most-recent-first like the app's other lists.
    orderBy: { invoice: { invoiceDate: "asc" } },
  });

  return lines.map((l, i) => {
    const gaps: string[] = [];
    if (!l.invoice.patientName) gaps.push("patient name");
    if (!l.invoice.patientAddress) gaps.push("patient address");
    if (!l.invoice.doctor?.name) gaps.push("prescriber");
    // The prescriber's registration number is what makes the entry
    // traceable to a real practitioner.
    if (!l.invoice.doctor?.registrationNo) gaps.push("prescriber reg. no.");

    return {
      serial: i + 1,
      date: l.invoice.invoiceDate,
      invoiceNo: l.invoice.invoiceNo,
      branchName: l.invoice.branch.name,
      scheduleClass: l.item.scheduleClass,
      itemName: l.item.name,
      batchNo: l.batch?.batchNo ?? "—",
      qty: l.qty,
      unit: l.item.unit,
      patientName: l.invoice.patientName,
      patientAddress: l.invoice.patientAddress,
      patientPhone: l.invoice.patientPhone,
      doctorName: l.invoice.doctor?.name ?? null,
      doctorRegistrationNo: l.invoice.doctor?.registrationNo ?? null,
      doctorClinic: l.invoice.doctor?.clinicName ?? null,
      prescriptionImageUrl: l.invoice.prescriptionImageUrl,
      dispensedBy: l.invoice.pharmacistSignoff?.name ?? null,
      gaps,
    };
  });
}
