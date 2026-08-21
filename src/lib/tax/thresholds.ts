/**
 * Turnover thresholds that switch on extra tax obligations.
 *
 * Deliberately a monitor and not a collection engine.
 *
 *   TCS under GST s.52 applies to e-commerce operators, which a pharmacy
 *   counter is not, so it is out of scope entirely.
 *
 *   TCS under Income Tax 206C(1H) applies to a *seller* whose turnover
 *   exceeded ₹10 crore in the preceding financial year, at 0.1% on
 *   consideration received from a buyer beyond ₹50 lakh in the year.
 *
 *   TDS under 194Q is the mirror image for a *buyer* over the same
 *   turnover, deducting on purchases beyond ₹50 lakh from one supplier.
 *
 * Both are wholesale-scale obligations. Implementing collection, PAN
 * validation, certificates and quarterly returns for a shop nowhere near
 * the threshold would be a large amount of code that is wrong until it is
 * needed and untested when it is. What a system can usefully do is watch
 * the two numbers a person will not: total turnover, and cumulative
 * dealings with any one party.
 */

/** Preceding-FY turnover above which 206C(1H) / 194Q can apply. */
export const TURNOVER_THRESHOLD = 100_000_000; // ₹10 crore

/** Per-party annual threshold beyond which collection/deduction begins. */
export const PARTY_THRESHOLD = 5_000_000; // ₹50 lakh

/** Warn before the line rather than after it. */
const APPROACHING = 0.8;

export type ThresholdStatus = "not-applicable" | "approaching" | "crossed";

export function turnoverStatus(turnover: number): ThresholdStatus {
  if (turnover >= TURNOVER_THRESHOLD) return "crossed";
  if (turnover >= TURNOVER_THRESHOLD * APPROACHING) return "approaching";
  return "not-applicable";
}

export function partyStatus(amount: number): ThresholdStatus {
  if (amount >= PARTY_THRESHOLD) return "crossed";
  if (amount >= PARTY_THRESHOLD * APPROACHING) return "approaching";
  return "not-applicable";
}

/** 0.1%, applied only to the excess over the party threshold. */
export function tcsOn(cumulativeReceipts: number): number {
  const excess = Math.max(0, cumulativeReceipts - PARTY_THRESHOLD);
  return Math.round(excess * 0.001 * 100) / 100;
}

/** The Indian financial year (1 April – 31 March) containing `date`. */
export function financialYearOf(date: Date): { start: Date; end: Date; label: string } {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: new Date(y, 3, 1),
    end: new Date(y + 1, 2, 31, 23, 59, 59, 999),
    label: `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`,
  };
}
