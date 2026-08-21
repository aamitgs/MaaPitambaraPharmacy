"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { ageCharges, type AgeingBucket } from "@/lib/ageing";

/**
 * What the pharmacy owes suppliers, and how late it is.
 *
 * The mirror of receivables, and deliberately the same arithmetic — the
 * ageing module is shared, so "oldest first" means the same thing on both
 * sides of the ledger and a bug fixed in one is fixed in both.
 *
 * Gated on `purchasing.viewRates` rather than `purchasing.manage`: this
 * exposes what the pharmacy pays, which is the commercially sensitive part
 * and already has its own permission.
 */
export type PayableRow = {
  supplierId: string;
  name: string;
  paymentTermsDays: number | null;
  balance: number;
  overdue: number;
  oldestOverdueDays: number;
  buckets: Record<AgeingBucket, number>;
};

export async function getPayables(): Promise<{
  rows: PayableRow[];
  totalOutstanding: number;
  totalOverdue: number;
  dueThisWeek: number;
}> {
  const session = await requirePermission("purchasing.viewRates");
  const tenantId = session.user.tenantId;

  const [suppliers, entries] = await Promise.all([
    prisma.supplier.findMany({
      where: { tenantId },
      select: { id: true, name: true, paymentTermsDays: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { supplierId: true, amount: true, dueDate: true, createdAt: true },
    }),
  ]);

  const bySupplier = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = bySupplier.get(e.supplierId) ?? [];
    list.push(e);
    bySupplier.set(e.supplierId, list);
  }

  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 86_400_000);
  const rows: PayableRow[] = [];
  let dueThisWeek = 0;

  for (const s of suppliers) {
    const list = bySupplier.get(s.id) ?? [];

    // Purchases are positive, payments and returns negative — the same
    // sign convention the customer ledger uses.
    const charges = list
      .filter((e) => Number(e.amount) > 0)
      // A purchase with no due date is treated as due when it was made:
      // terms set after the fact should not make an old bill look current.
      .map((e) => ({ amount: Number(e.amount), dueDate: e.dueDate ?? e.createdAt }));
    const creditTotal = list
      .filter((e) => Number(e.amount) < 0)
      .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);

    const aged = ageCharges(charges, creditTotal, now);
    if (aged.balance <= 0.005) continue;

    // What newly falls due in the next seven days. Deliberately excludes
    // anything already past its date — that is the overdue total, and
    // counting it here as well would just restate the outstanding balance.
    let applied = creditTotal;
    for (const c of [...charges].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())) {
      const settled = Math.min(applied, c.amount);
      applied -= settled;
      const remaining = c.amount - settled;
      if (remaining > 0.005 && c.dueDate > now && c.dueDate <= weekOut) {
        dueThisWeek += remaining;
      }
    }

    rows.push({
      supplierId: s.id,
      name: s.name,
      paymentTermsDays: s.paymentTermsDays,
      balance: aged.balance,
      overdue: aged.overdue,
      oldestOverdueDays: aged.oldestOverdueDays,
      buckets: aged.buckets,
    });
  }

  rows.sort((a, b) => b.oldestOverdueDays - a.oldestOverdueDays || b.overdue - a.overdue);

  return {
    rows,
    totalOutstanding: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100,
    totalOverdue: Math.round(rows.reduce((s, r) => s + r.overdue, 0) * 100) / 100,
    dueThisWeek: Math.round(dueThisWeek * 100) / 100,
  };
}
