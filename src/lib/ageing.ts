/**
 * Ageing a customer's balance.
 *
 * Payments are applied to the oldest charge first. That is the convention
 * a customer expects — money handed over settles the oldest bill — and it
 * is what makes an ageing bucket mean anything: applied newest-first, a
 * customer who pays regularly would still show an ancient unpaid charge
 * forever.
 */

export type AgeingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export type Charge = { amount: number; dueDate: Date };

export function bucketFor(daysLate: number): AgeingBucket {
  if (daysLate <= 0) return "current";
  if (daysLate <= 30) return "1-30";
  if (daysLate <= 60) return "31-60";
  if (daysLate <= 90) return "61-90";
  return "90+";
}

export const emptyBuckets = (): Record<AgeingBucket, number> => ({
  current: 0,
  "1-30": 0,
  "31-60": 0,
  "61-90": 0,
  "90+": 0,
});

export type Ageing = {
  buckets: Record<AgeingBucket, number>;
  balance: number;
  overdue: number;
  oldestOverdueDays: number;
};

export function ageCharges(charges: Charge[], creditTotal: number, now: Date): Ageing {
  // Oldest first, so the sort order is the payment-application order.
  const ordered = [...charges]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((c) => ({ remaining: c.amount, dueDate: c.dueDate }));

  let credit = creditTotal;
  for (const charge of ordered) {
    if (credit <= 0) break;
    const applied = Math.min(credit, charge.remaining);
    charge.remaining -= applied;
    credit -= applied;
  }

  const buckets = emptyBuckets();
  let overdue = 0;
  let oldestOverdueDays = 0;

  for (const charge of ordered) {
    // Half a paisa, so floating-point residue from repeated subtraction
    // does not leave a phantom charge on the ageing.
    if (charge.remaining <= 0.005) continue;
    const daysLate = Math.floor((now.getTime() - charge.dueDate.getTime()) / 86_400_000);
    buckets[bucketFor(daysLate)] += charge.remaining;
    if (daysLate > 0) {
      overdue += charge.remaining;
      oldestOverdueDays = Math.max(oldestOverdueDays, daysLate);
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    buckets: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, round(v)])
    ) as Record<AgeingBucket, number>,
    balance: round(Object.values(buckets).reduce((a, b) => a + b, 0)),
    overdue: round(overdue),
    oldestOverdueDays,
  };
}
