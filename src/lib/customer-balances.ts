import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Customer.outstandingBalance is a cache column, never trusted. The real
 * balance is always the sum of this customer's ledger entries (credit
 * sales positive, payments negative) — mirrors computeOutstandingBalances
 * in suppliers.ts.
 *
 * Deliberately not a Server Action: it takes tenantId as a bare argument
 * with no session check of its own, trusting the caller (another action
 * that has already authenticated) to have derived it from a real session.
 * Living outside any "use server" file means it can never be exposed as a
 * directly callable endpoint, however it's imported in the future.
 */
export async function computeCustomerOutstandingBalances(tenantId: string, customerIds?: string[]) {
  const grouped = await prisma.customerLedgerEntry.groupBy({
    by: ["customerId"],
    where: { tenantId, ...(customerIds ? { customerId: { in: customerIds } } : {}) },
    _sum: { amount: true },
  });
  const balances = new Map<string, number>();
  for (const g of grouped) balances.set(g.customerId, Number(g._sum.amount ?? 0));
  return balances;
}
