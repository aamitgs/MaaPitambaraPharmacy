"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { findDuplicateGroups, type DuplicateGroup } from "@/lib/customer-identity";

export type DuplicateMember = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: Date;
  balance: number;
  invoiceCount: number;
  lastSeen: Date | null;
};

/**
 * Everything the reviewer needs to decide whether two records are one
 * person — including the balances, because that is what a merge moves.
 */
export async function getDuplicateCustomers(): Promise<DuplicateGroup<DuplicateMember>[]> {
  const session = await requirePermission("customers.manage");
  const tenantId = session.user.tenantId;

  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true, name: true, phone: true, createdAt: true },
  });

  const groups = findDuplicateGroups(customers);
  const ids = groups.flatMap((g) => g.members.map((m) => m.id));
  if (ids.length === 0) return [];

  const [ledger, invoices] = await Promise.all([
    prisma.customerLedgerEntry.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids } },
      _sum: { amount: true },
    }),
    prisma.salesInvoice.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids } },
      _count: { _all: true },
      _max: { invoiceDate: true },
    }),
  ]);

  const balances = new Map(ledger.map((l) => [l.customerId, Number(l._sum.amount ?? 0)]));
  const invoiceStats = new Map(
    invoices.map((i) => [i.customerId, { count: i._count._all, last: i._max.invoiceDate }])
  );

  return groups.map((g) => ({
    ...g,
    members: g.members.map((m) => ({
      ...m,
      balance: balances.get(m.id) ?? 0,
      invoiceCount: invoiceStats.get(m.id)?.count ?? 0,
      lastSeen: invoiceStats.get(m.id)?.last ?? null,
    })),
  }));
}

/**
 * Folds duplicate customer records into one.
 *
 * Everything is moved, nothing is recreated: invoices keep their own ids
 * and totals, ledger entries keep their dates and amounts, and the merged
 * balance is the arithmetic sum of what the separate accounts held. That
 * matters because a credit balance is money someone actually owes — a
 * merge that recomputed it from invoices would silently drop payments
 * recorded against the losing record.
 *
 * The losing rows are deleted only after every reference has moved, inside
 * one transaction, so a failure half-way leaves the accounts exactly as
 * they were rather than orphaning a year of bills.
 */
export async function mergeCustomers(survivorId: string, mergedIds: string[]) {
  const session = await requirePermission("customers.manage");
  const tenantId = session.user.tenantId;

  const losers = mergedIds.filter((id) => id !== survivorId);
  if (losers.length === 0) throw new Error("Nothing to merge.");

  const all = await prisma.customer.findMany({
    where: { tenantId, id: { in: [survivorId, ...losers] } },
    select: {
      id: true, name: true, phone: true, cumulativeSpend: true,
      creditLimit: true, creditTermDays: true,
    },
  });
  if (all.length !== losers.length + 1) {
    throw new Error("One of those customers no longer exists. Reload the page and try again.");
  }
  const survivor = all.find((c) => c.id === survivorId);
  if (!survivor) throw new Error("Customer not found");

  const merged = await prisma.$transaction(async (tx) => {
    const where = { customerId: { in: losers } };
    await tx.salesInvoice.updateMany({ where, data: { customerId: survivorId } });
    await tx.customerLedgerEntry.updateMany({ where, data: { customerId: survivorId } });
    await tx.promiseOrder.updateMany({ where, data: { customerId: survivorId } });
    await tx.smsLog.updateMany({ where, data: { customerId: survivorId } });
    await tx.emailLog.updateMany({ where, data: { customerId: survivorId } });
    await tx.whatsAppLog.updateMany({ where, data: { customerId: survivorId } });

    // Spend is cumulative across every record that was really this person,
    // so a loyalty tier they have already earned survives the merge.
    const cumulativeSpend = all.reduce((sum, c) => sum + Number(c.cumulativeSpend), 0);

    // Keep the contact details and the terms already extended. Losing the
    // only phone number, or quietly tightening a credit limit, would each
    // be a real regression for the customer standing at the counter.
    const phone = survivor.phone ?? all.find((c) => c.phone)?.phone ?? null;
    const limits = all.map((c) => c.creditLimit).filter((v) => v != null).map(Number);
    const terms = all.map((c) => c.creditTermDays).filter((v): v is number => v != null);

    // The balance is re-summed from the ledger now that every entry has
    // moved — never recomputed from invoices, which would drop payments
    // that were recorded against the losing record.
    const sum = await tx.customerLedgerEntry.aggregate({
      where: { customerId: survivorId },
      _sum: { amount: true },
    });

    const updated = await tx.customer.update({
      where: { id: survivorId },
      data: {
        phone,
        cumulativeSpend,
        creditLimit: limits.length ? Math.max(...limits) : null,
        creditTermDays: terms.length ? Math.max(...terms) : null,
        outstandingBalance: sum._sum.amount ?? 0,
      },
    });

    // Deleted only once nothing points at them any more. Inside the same
    // transaction, so a failure anywhere above leaves all the accounts
    // exactly as they were.
    await tx.customer.deleteMany({ where: { tenantId, id: { in: losers } } });

    return updated;
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "customer.merge",
    entity: "Customer",
    entityId: survivorId,
    before: { records: all.map((c) => ({ id: c.id, name: c.name, phone: c.phone })) },
    after: {
      survivorId,
      mergedIds: losers,
      balance: Number(merged.outstandingBalance),
      cumulativeSpend: Number(merged.cumulativeSpend),
    },
  });

  revalidatePath("/customers");
  revalidatePath("/customers/duplicates");
  revalidatePath("/receivables");
  revalidatePath("/pos");
  return { survivorId, mergedCount: losers.length, balance: Number(merged.outstandingBalance) };
}
