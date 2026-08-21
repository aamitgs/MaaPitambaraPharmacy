/**
 * How much to reorder.
 *
 * Pure arithmetic, kept out of the server action so it can be tested
 * without a database — the numbers here decide what a pharmacy spends
 * money on, so they are worth pinning down exactly.
 */

/** Days of demand a replenishment should cover, on top of the reorder level. */
export const DEFAULT_COVER_DAYS = 30;

/** Nothing is ordered in fractions of a strip. */
const roundUpToPack = (qty: number, packMultiple: number) =>
  packMultiple > 1 ? Math.ceil(qty / packMultiple) * packMultiple : Math.ceil(qty);

export type ReorderInput = {
  currentQty: number;
  reorderLevel: number;
  /** Units sold across the observation window. */
  soldInWindow: number;
  windowDays: number;
  coverDays?: number;
  packMultiple?: number;
};

export type ReorderSuggestion = {
  /** Units sold per day over the window. */
  dailyVelocity: number;
  /** How long current stock lasts at that rate; null when nothing is selling. */
  daysOfCover: number | null;
  /** Units to bring stock back to the reorder level. */
  gapToReorderLevel: number;
  /** What to actually order. */
  suggestedQty: number;
  /** Why that number, in words the person approving it can check. */
  basis: "velocity" | "reorder-level" | "minimum";
};

export function suggestReorderQty(input: ReorderInput): ReorderSuggestion {
  const coverDays = input.coverDays ?? DEFAULT_COVER_DAYS;
  const packMultiple = input.packMultiple ?? 1;

  const dailyVelocity = input.windowDays > 0 ? input.soldInWindow / input.windowDays : 0;
  const daysOfCover = dailyVelocity > 0 ? input.currentQty / dailyVelocity : null;

  const gapToReorderLevel = Math.max(0, input.reorderLevel - input.currentQty);

  // Enough to cover the next `coverDays` of demand, measured from what is
  // actually on the shelf. An item that sells fast needs more than its
  // reorder level implies; one that barely moves needs only the gap, so
  // topping up to the reorder level does not become a standing order for
  // stock that will expire on the shelf.
  const velocityQty = Math.max(0, dailyVelocity * coverDays - input.currentQty);

  const raw = Math.max(gapToReorderLevel, velocityQty);
  const suggestedQty = raw > 0 ? roundUpToPack(raw, packMultiple) : 0;

  const basis: ReorderSuggestion["basis"] =
    raw === 0 ? "minimum" : velocityQty > gapToReorderLevel ? "velocity" : "reorder-level";

  return {
    dailyVelocity: Math.round(dailyVelocity * 100) / 100,
    daysOfCover: daysOfCover === null ? null : Math.round(daysOfCover * 10) / 10,
    gapToReorderLevel,
    suggestedQty,
    basis,
  };
}
