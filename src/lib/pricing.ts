/**
 * Which price a line is billed at.
 *
 * A pharmacy that also supplies other shops sells the same batch at two
 * different prices: MRP-derived retail to a patient, and PTR to a
 * retailer. Both are legitimate; what is not legitimate is losing track of
 * which one a given invoice used, because the margin on the two is
 * completely different and an average of them describes nothing.
 */

export type PriceBasis = "mrp" | "ptr";

export type BatchPricing = {
  saleRate: number;
  ptr: number | null;
};

/**
 * The rate to charge. Falls back to retail when PTR is asked for but not
 * set — refusing the sale would be worse, and billing silently at MRP is
 * visible on the bill, so the counter can see what happened.
 */
export function rateFor(batch: BatchPricing, basis: PriceBasis): number {
  if (basis === "ptr" && batch.ptr !== null && batch.ptr > 0) return batch.ptr;
  return batch.saleRate;
}

/** What was actually applied, which may differ from what was asked for. */
export function effectiveBasis(batch: BatchPricing, requested: PriceBasis): PriceBasis {
  return requested === "ptr" && batch.ptr !== null && batch.ptr > 0 ? "ptr" : "mrp";
}

/**
 * Margin on a line, against the rate actually charged.
 *
 * Wholesale margin is thin by nature — a few percent where retail is
 * twenty or more. Reporting them together without the basis makes a
 * healthy wholesale month look like a collapse in retail performance.
 */
export function lineMargin(rate: number, purchaseRate: number, qty: number) {
  const revenue = rate * qty;
  const cost = purchaseRate * qty;
  const margin = revenue - cost;
  return {
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    marginPercent: revenue === 0 ? 0 : Math.round((margin / revenue) * 1000) / 10,
  };
}
