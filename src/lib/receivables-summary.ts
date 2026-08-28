import "server-only";
import { prisma } from "@/lib/prisma";
import { ageCharges, type AgeingBucket } from "@/lib/ageing";

/**
 * What customers owe, and how late it is.
 *
 * Balances were already visible; ageing was not, because nothing carried a
 * due date. A balance tells you the amount, an ageing tells you which ones
 * to ring today — and those are different lists.
 *
 * Payments are applied oldest-charge-first when ageing, which is the
 * convention a customer expects: money handed over settles the oldest
 * bill, not the newest.
 */

export type ReceivableRow = {
  customerId: string;
  name: string;
  phone: string | null;
  creditLimit: number | null;
  creditTermDays: number | null;
  balance: number;
  /** Amount past its due date. */
  overdue: number;
  /** Days since the oldest still-unpaid charge fell due; 0 when none is. */
  oldestOverdueDays: number;
  buckets: Record<AgeingBucket, number>;
};

/**
 * Deliberately not a Server Action, and neither is computeReceivables below:
 * both take tenantId as a bare argument with no session check of their own,
 * trusting the caller (another action that has already authenticated) to
 * have derived it from a real session. Living outside any "use server" file
 * means neither can be exposed as a directly callable endpoint, however
 * they're imported in the future.
 */
export async function computeReceivables(tenantId: string): Promise<{
  rows: ReceivableRow[];
  totalOutstanding: number;
  totalOverdue: number;
}> {
  const [customers, entries] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, creditLimit: { not: null } },
      select: { id: true, name: true, phone: true, creditLimit: true, creditTermDays: true },
      orderBy: { name: "asc" },
    }),
    prisma.customerLedgerEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { customerId: true, amount: true, dueDate: true, createdAt: true, type: true },
    }),
  ]);

  const byCustomer = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byCustomer.get(e.customerId) ?? [];
    list.push(e);
    byCustomer.set(e.customerId, list);
  }

  const now = new Date();
  const rows: ReceivableRow[] = [];

  for (const c of customers) {
    const list = byCustomer.get(c.id) ?? [];

    // Charges and credits kept apart so payments can be applied against
    // the oldest charge first.
    const charges = list
      .filter((e) => Number(e.amount) > 0)
      // A charge with no due date is treated as due when it was raised —
      // the term was set after the fact, so the honest reading is "already
      // due", not "never due".
      .map((e) => ({ amount: Number(e.amount), dueDate: e.dueDate ?? e.createdAt }));
    const creditTotal = list
      .filter((e) => Number(e.amount) < 0)
      .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);

    const aged = ageCharges(charges, creditTotal, now);
    // An unused credit account is noise on a chase list.
    if (aged.balance <= 0.005) continue;

    rows.push({
      customerId: c.id,
      name: c.name,
      phone: c.phone,
      creditLimit: c.creditLimit === null ? null : Number(c.creditLimit),
      creditTermDays: c.creditTermDays,
      balance: aged.balance,
      overdue: aged.overdue,
      oldestOverdueDays: aged.oldestOverdueDays,
      buckets: aged.buckets,
    });
  }

  // Most overdue first — that is the order they get chased in.
  rows.sort((a, b) => b.oldestOverdueDays - a.oldestOverdueDays || b.overdue - a.overdue);

  return {
    rows,
    totalOutstanding: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100,
    totalOverdue: Math.round(rows.reduce((s, r) => s + r.overdue, 0) * 100) / 100,
  };
}

/**
 * Totals for the dashboard tile.
 *
 * Deliberately the same computation as the Receivables screen rather than
 * a quicker SUM over the ledger: a dashboard figure that disagrees with
 * the screen it links to is worse than no figure, and the two would drift
 * the moment payment application changed.
 */
export async function getReceivablesSummary(tenantId: string) {
  const { totalOutstanding, totalOverdue, rows } = await computeReceivables(tenantId);
  return {
    totalOutstanding,
    totalOverdue,
    overdueCustomerCount: rows.filter((r) => r.overdue > 0).length,
  };
}
