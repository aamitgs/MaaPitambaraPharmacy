/**
 * Checking what arrived against what was ordered.
 *
 * A purchase order records a rate agreed with the distributor. The goods
 * receipt records what their invoice actually charges. Nothing compared
 * the two, so a line ordered at ₹28 and invoiced at ₹32 was received,
 * paid and forgotten — the pharmacy's own purchase order was the evidence
 * and nobody looked at it.
 *
 * This does not block a receipt. Rates genuinely move between order and
 * delivery, and refusing the stock at the door helps nobody. It makes the
 * difference visible before the receipt is saved, and recorded after.
 */

export type OrderedLine = { itemId: string; itemName: string; qty: number; rate: number };
export type ReceivedLine = { itemId: string; itemName: string; qty: number; rate: number };

export type VarianceKind =
  | "rate-higher"
  | "rate-lower"
  | "qty-over"
  | "qty-short"
  | "not-ordered";

export type Variance = {
  kind: VarianceKind;
  itemId: string;
  itemName: string;
  ordered: number | null;
  received: number;
  /// Rupees at stake on this line. Positive means it costs more than the
  /// order agreed; negative means less.
  costImpact: number;
  message: string;
};

/**
 * Paise-level differences are rounding, not overcharging — distributor
 * invoices routinely differ by a paisa or two once scheme adjustments are
 * applied per line. Anything above this is a real difference.
 */
export const RATE_TOLERANCE = 0.01;

const money = (n: number) => `₹${n.toFixed(2)}`;

/**
 * Rates are money and money is decimal, but these arrive as floats, where
 * 28.01 − 28 is 0.010000000000001563. Comparing that raw against a one
 * paisa tolerance reports a paisa of rounding as an overcharge, so the
 * difference is rounded to paise before it is judged.
 */
const paise = (n: number) => Math.round(n * 100) / 100;

export function comparePurchase(
  ordered: OrderedLine[],
  received: ReceivedLine[]
): Variance[] {
  // An order can list the same item on two lines; what matters for
  // comparison is the total ordered and the rate agreed for it.
  const orderedByItem = new Map<string, { qty: number; rate: number; itemName: string }>();
  for (const line of ordered) {
    const prev = orderedByItem.get(line.itemId);
    orderedByItem.set(line.itemId, {
      qty: (prev?.qty ?? 0) + line.qty,
      // The latest rate on the order wins; a re-quoted line supersedes.
      rate: line.rate,
      itemName: line.itemName,
    });
  }

  const receivedByItem = new Map<string, { qty: number; rate: number; itemName: string }>();
  for (const line of received) {
    const prev = receivedByItem.get(line.itemId);
    receivedByItem.set(line.itemId, {
      qty: (prev?.qty ?? 0) + line.qty,
      rate: line.rate,
      itemName: line.itemName,
    });
  }

  const variances: Variance[] = [];

  for (const [itemId, got] of receivedByItem) {
    const want = orderedByItem.get(itemId);

    if (!want) {
      variances.push({
        kind: "not-ordered",
        itemId,
        itemName: got.itemName,
        ordered: null,
        received: got.qty,
        costImpact: got.qty * got.rate,
        message:
          `${got.itemName} was not on this order — ${got.qty} received at ${money(got.rate)} ` +
          `(${money(got.qty * got.rate)}).`,
      });
      continue;
    }

    const rateDiff = paise(got.rate - want.rate);
    if (Math.abs(rateDiff) > RATE_TOLERANCE) {
      variances.push({
        kind: rateDiff > 0 ? "rate-higher" : "rate-lower",
        itemId,
        itemName: got.itemName,
        ordered: want.rate,
        received: got.rate,
        // Charged on what actually arrived, not on what was ordered.
        costImpact: rateDiff * got.qty,
        message:
          `${got.itemName} was ordered at ${money(want.rate)} and invoiced at ` +
          `${money(got.rate)} — ${rateDiff > 0 ? "costing" : "saving"} ` +
          `${money(Math.abs(rateDiff * got.qty))} on ${got.qty}.`,
      });
    }

    if (got.qty !== want.qty) {
      const over = got.qty > want.qty;
      variances.push({
        kind: over ? "qty-over" : "qty-short",
        itemId,
        itemName: got.itemName,
        ordered: want.qty,
        received: got.qty,
        costImpact: (got.qty - want.qty) * got.rate,
        message:
          `${got.itemName}: ${want.qty} ordered, ${got.qty} received` +
          (over
            ? ` — ${got.qty - want.qty} more than ordered, ${money((got.qty - want.qty) * got.rate)} extra.`
            : ` — ${want.qty - got.qty} short.`),
      });
    }
  }

  // Ordered but nothing arrived at all: a short delivery of the whole line.
  for (const [itemId, want] of orderedByItem) {
    if (receivedByItem.has(itemId)) continue;
    variances.push({
      kind: "qty-short",
      itemId,
      itemName: want.itemName,
      ordered: want.qty,
      received: 0,
      costImpact: -want.qty * want.rate,
      message: `${want.itemName}: ${want.qty} ordered, none received.`,
    });
  }

  return variances;
}

/** What the whole receipt costs above or below the order. */
export function netCostImpact(variances: Variance[]): number {
  // Short lines are not a cost, they are an absence — counting them as a
  // saving would net off a real overcharge against a missing delivery.
  return variances
    .filter((v) => v.kind !== "qty-short")
    .reduce((sum, v) => sum + v.costImpact, 0);
}

/** Whether anything here costs the pharmacy more than it agreed to pay. */
export function hasOvercharge(variances: Variance[]): boolean {
  return variances.some(
    (v) => (v.kind === "rate-higher" || v.kind === "qty-over" || v.kind === "not-ordered")
  );
}
