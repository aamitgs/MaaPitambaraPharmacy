/**
 * When a batch stops being sellable.
 *
 * Indian pharma prints an expiry as a month ("06/27"), and the convention
 * is that the medicine is good through the LAST day of that month. This
 * app stores a date, so a batch dated 2027-06-30 and one dated 2027-06-01
 * both mean "June 2027" on the carton — treating the second as dead on the
 * 2nd would condemn stock that is legally sellable for another four weeks.
 *
 * So expiry is evaluated at month granularity: a batch is expired once the
 * current month is past its expiry month.
 */
export function isBatchExpired(expiryDate: Date, now: Date = new Date()): boolean {
  const expiryMonthEnd = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  return now > expiryMonthEnd;
}

/** Whole days until the end of the expiry month; negative once past. */
export function daysUntilExpiry(expiryDate: Date, now: Date = new Date()): number {
  const expiryMonthEnd = new Date(expiryDate.getFullYear(), expiryDate.getMonth() + 1, 0);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiryMonthEnd.getTime() - startOfToday.getTime()) / 86_400_000);
}
