"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  financialYearOf,
  partyStatus,
  turnoverStatus,
  tcsOn,
  PARTY_THRESHOLD,
  TURNOVER_THRESHOLD,
  type ThresholdStatus,
} from "@/lib/tax/thresholds";

/**
 * Watches the two numbers that decide whether TCS/TDS ever applies.
 *
 * Nothing is collected or deducted here — see the note in
 * src/lib/tax/thresholds.ts for why building that now would be wrong. This
 * answers "is it applicable yet, and who is getting close", which is the
 * part a person will not notice on their own.
 */
export type PartyExposure = {
  id: string;
  name: string;
  kind: "customer" | "supplier";
  amount: number;
  status: ThresholdStatus;
  /** What TCS would be, if the pharmacy were over the turnover threshold. */
  indicativeTcs: number;
};

export async function getTaxThresholdStatus(asOf: Date = new Date()) {
  const session = await requirePermission("compliance.manage");
  const tenantId = session.user.tenantId;
  const fy = financialYearOf(asOf);
  const previousFy = financialYearOf(new Date(fy.start.getFullYear() - 1, 5, 1));

  const [thisYear, lastYear, customerTotals, supplierTotals] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: {
        tenantId,
        status: "completed",
        invoiceDate: { gte: fy.start, lte: fy.end },
      },
      _sum: { total: true },
    }),
    // The obligation keys off the *preceding* year's turnover, not this
    // one — a shop crossing ₹10 crore today does not start collecting
    // today.
    prisma.salesInvoice.aggregate({
      where: {
        tenantId,
        status: "completed",
        invoiceDate: { gte: previousFy.start, lte: previousFy.end },
      },
      _sum: { total: true },
    }),
    prisma.salesInvoice.groupBy({
      by: ["customerId"],
      where: {
        tenantId,
        status: "completed",
        customerId: { not: null },
        invoiceDate: { gte: fy.start, lte: fy.end },
      },
      _sum: { total: true },
    }),
    // Purchases from the supplier ledger rather than by summing GRN lines:
    // the ledger is the authoritative record of what was actually
    // transacted with a party, and 194Q keys off exactly that.
    prisma.supplierLedgerEntry.groupBy({
      by: ["supplierId"],
      where: {
        tenantId,
        type: "purchase",
        createdAt: { gte: fy.start, lte: fy.end },
      },
      _sum: { amount: true },
    }),
  ]);

  const customerIds = customerTotals.map((c) => c.customerId!).filter(Boolean);
  const supplierIds = supplierTotals.map((s) => s.supplierId);
  const [customers, suppliers] = await Promise.all([
    customerIds.length
      ? prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : [],
    supplierIds.length
      ? prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const parties: PartyExposure[] = [
    ...customerTotals.map((c) => {
      const amount = Number(c._sum.total ?? 0);
      return {
        id: c.customerId!,
        name: customerName.get(c.customerId!) ?? "Unknown",
        kind: "customer" as const,
        amount,
        status: partyStatus(amount),
        indicativeTcs: tcsOn(amount),
      };
    }),
    ...supplierTotals.map((s) => {
      const amount = Number(s._sum.amount ?? 0);
      return {
        id: s.supplierId,
        name: supplierName.get(s.supplierId) ?? "Unknown",
        kind: "supplier" as const,
        amount,
        status: partyStatus(amount),
        indicativeTcs: 0,
      };
    }),
  ]
    .filter((p) => p.status !== "not-applicable")
    .sort((a, b) => b.amount - a.amount);

  const currentTurnover = Number(thisYear._sum.total ?? 0);
  const precedingTurnover = Number(lastYear._sum.total ?? 0);

  return {
    financialYear: fy.label,
    precedingFinancialYear: previousFy.label,
    currentTurnover,
    precedingTurnover,
    /** Whether TCS/TDS can apply at all this year. */
    obligationStatus: turnoverStatus(precedingTurnover),
    /** Where this year is heading, for advance warning. */
    trajectoryStatus: turnoverStatus(currentTurnover),
    turnoverThreshold: TURNOVER_THRESHOLD,
    partyThreshold: PARTY_THRESHOLD,
    parties,
  };
}
