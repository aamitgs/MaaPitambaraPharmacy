"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { resolveConcreteBranch } from "@/lib/branch-scope";

/**
 * Shift cash-up. Answers the only question that matters at closing time:
 * how much should be in the drawer, and how much actually is.
 *
 * Credit sales are shown but excluded from the expected cash — nothing was
 * handed over — and non-cash refunds are listed separately for the same
 * reason: a UPI refund never came out of the till.
 */
export type CashUpDraft = {
  periodStart: string;
  periodEnd: string;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  creditSales: number;
  cashRefunds: number;
  otherRefunds: number;
  invoiceCount: number;
  refundCount: number;
  /** Suggested opening float: what the last count was left with. */
  suggestedFloat: number;
  lastClosedAt: string | null;
};

export async function getCashUpDraft(from?: string, to?: string): Promise<CashUpDraft> {
  const session = await requirePermission("cashup.manage");
  const tenantId = session.user.tenantId;

  const last = await prisma.cashUp.findFirst({
    where: { tenantId },
    orderBy: { closedAt: "desc" },
  });

  // Default window runs from the last cash-up to now, so nothing is counted
  // twice and nothing falls between two shifts.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const periodStart = from ? new Date(from) : (last?.periodEnd ?? startOfToday);
  const periodEnd = to ? new Date(to) : new Date();

  const [invoices, refunds] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        tenantId,
        status: "completed",
        invoiceDate: { gte: periodStart, lte: periodEnd },
      },
      select: { total: true, paymentMode: true },
    }),
    prisma.salesReturn.findMany({
      where: { tenantId, returnedAt: { gte: periodStart, lte: periodEnd } },
      select: { total: true, refundMethod: true },
    }),
  ]);

  const byMode = { cash: 0, upi: 0, card: 0, credit: 0 };
  for (const invoice of invoices) {
    byMode[invoice.paymentMode as keyof typeof byMode] += Number(invoice.total);
  }

  let cashRefunds = 0;
  let otherRefunds = 0;
  for (const refund of refunds) {
    if (refund.refundMethod === "cash") cashRefunds += Number(refund.total);
    else otherRefunds += Number(refund.total);
  }

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    cashSales: round2(byMode.cash),
    upiSales: round2(byMode.upi),
    cardSales: round2(byMode.card),
    creditSales: round2(byMode.credit),
    cashRefunds: round2(cashRefunds),
    otherRefunds: round2(otherRefunds),
    invoiceCount: invoices.length,
    refundCount: refunds.length,
    suggestedFloat: last ? Number(last.countedCash) : 0,
    lastClosedAt: last?.closedAt.toISOString() ?? null,
  };
}

const closeSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  openingFloat: z.coerce.number().min(0),
  countedCash: z.coerce.number().min(0),
  note: z.string().trim().max(500).optional(),
});

export async function closeCashUp(input: z.infer<typeof closeSchema>) {
  const session = await requirePermission("cashup.manage");
  const parsed = closeSchema.parse(input);

  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this pharmacy yet.");

  // Recomputed here rather than trusted from the form: the browser has been
  // sitting open while sales continued, and a stale figure would bake a
  // false variance into the record.
  const draft = await getCashUpDraft(parsed.periodStart, parsed.periodEnd);
  const expectedCash = round2(parsed.openingFloat + draft.cashSales - draft.cashRefunds);
  const variance = round2(parsed.countedCash - expectedCash);

  const created = await prisma.cashUp.create({
    data: {
      tenantId: session.user.tenantId,
      branchId,
      periodStart: new Date(parsed.periodStart),
      periodEnd: new Date(parsed.periodEnd),
      openingFloat: parsed.openingFloat,
      cashSales: draft.cashSales,
      upiSales: draft.upiSales,
      cardSales: draft.cardSales,
      creditSales: draft.creditSales,
      cashRefunds: draft.cashRefunds,
      otherRefunds: draft.otherRefunds,
      expectedCash,
      countedCash: parsed.countedCash,
      variance,
      note: parsed.note || null,
      countedByUserId: session.user.id,
    },
  });

  revalidatePath("/cash-up");
  return { id: created.id, variance, expectedCash };
}

export type CashUpRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  closedAt: string;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  creditSales: number;
  cashRefunds: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  note: string | null;
  countedByName: string;
};

export async function listCashUps(): Promise<CashUpRow[]> {
  const session = await requirePermission("cashup.manage");
  const rows = await prisma.cashUp.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { closedAt: "desc" },
    take: 60,
    include: { countedBy: { select: { name: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    closedAt: r.closedAt.toISOString(),
    cashSales: Number(r.cashSales),
    upiSales: Number(r.upiSales),
    cardSales: Number(r.cardSales),
    creditSales: Number(r.creditSales),
    cashRefunds: Number(r.cashRefunds),
    expectedCash: Number(r.expectedCash),
    countedCash: Number(r.countedCash),
    variance: Number(r.variance),
    note: r.note,
    countedByName: r.countedBy.name,
  }));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
