// Shared billing math — imported by both the POS client (live cart totals)
// and the completeSale server action (authoritative recompute from raw
// inputs, never trusting client-submitted totals). Pure functions only.

export interface BillingLineInput {
  lineId: string;
  qty: number;
  rate: number;
  taxRate: number;
  /** Item-level discount, percent of (qty * rate). 0-100. */
  discountPercent: number;
  /** Flat rupee discount from an auto-applied Scheme (e.g. free units under buy_x_get_y). */
  schemeDiscountAmount?: number;
}

export interface BillDiscountInput {
  isPercent: boolean;
  value: number;
}

/**
 * Bill-level discounts stack: the staff-entered manual discount, an
 * auto-applied loyalty-tier discount, and a validated coupon can all be
 * present on the same sale, each shown as its own line per spec ("shown as
 * a distinct line from manual discounts"). Each is computed off the same
 * post-item/scheme taxable base (not compounded on top of each other) and,
 * in the rare case their sum would exceed that base, scaled down
 * proportionally so the bill never goes negative.
 */
export interface StackedDiscountInput extends BillDiscountInput {
  type: "bill" | "loyalty" | "coupon";
}

export interface BillingLineResult {
  lineId: string;
  grossAmount: number;
  itemDiscountAmount: number;
  schemeDiscountAmount: number;
  billDiscountShare: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  taxAmount: number;
  lineTotal: number;
}

export interface BillDiscountBreakdown {
  type: "bill" | "loyalty" | "coupon";
  amount: number;
}

export interface BillingResult {
  lines: BillingLineResult[];
  subtotal: number;
  itemDiscountTotal: number;
  schemeDiscountTotal: number;
  billDiscounts: BillDiscountBreakdown[];
  billDiscountAmount: number;
  discountAmount: number;
  taxableTotal: number;
  taxAmount: number;
  /** Paise adjustment applied to reach a whole-rupee `total`. Signed: negative
   *  when the customer pays less than the computed amount. */
  roundOff: number;
  /** Whole rupees. What the customer pays and what gets recorded — the
   *  ledger, GST exports and the printed bill must not disagree. */
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeBilling(
  lineInputs: BillingLineInput[],
  billDiscounts: StackedDiscountInput[]
): BillingResult {
  const preBillDiscount = lineInputs.map((line) => {
    const grossAmount = line.qty * line.rate;
    const itemDiscountAmount = round2((grossAmount * line.discountPercent) / 100);
    const schemeDiscountAmount = round2(
      Math.max(0, Math.min(line.schemeDiscountAmount ?? 0, grossAmount - itemDiscountAmount))
    );
    const taxableBeforeBillDiscount = grossAmount - itemDiscountAmount - schemeDiscountAmount;
    return { line, grossAmount, itemDiscountAmount, schemeDiscountAmount, taxableBeforeBillDiscount };
  });

  const totalTaxableBeforeBillDiscount = preBillDiscount.reduce(
    (sum, l) => sum + l.taxableBeforeBillDiscount,
    0
  );

  const rawAmounts = billDiscounts.map((d) =>
    Math.max(0, d.isPercent ? (totalTaxableBeforeBillDiscount * d.value) / 100 : d.value)
  );
  const rawTotal = rawAmounts.reduce((sum, a) => sum + a, 0);
  const scale =
    rawTotal > totalTaxableBeforeBillDiscount && rawTotal > 0
      ? totalTaxableBeforeBillDiscount / rawTotal
      : 1;
  const billDiscountBreakdown: BillDiscountBreakdown[] = billDiscounts.map((d, i) => ({
    type: d.type,
    amount: round2(rawAmounts[i] * scale),
  }));
  const billDiscountAmount = round2(billDiscountBreakdown.reduce((sum, d) => sum + d.amount, 0));

  const lines: BillingLineResult[] = preBillDiscount.map((l) => {
    const share =
      totalTaxableBeforeBillDiscount > 0
        ? l.taxableBeforeBillDiscount / totalTaxableBeforeBillDiscount
        : 0;
    const billDiscountShare = round2(billDiscountAmount * share);
    const taxableValue = round2(l.taxableBeforeBillDiscount - billDiscountShare);
    const taxAmount = round2((taxableValue * l.line.taxRate) / 100);
    const cgst = round2(taxAmount / 2);
    const sgst = round2(taxAmount - cgst);
    const lineTotal = round2(taxableValue + cgst + sgst);
    return {
      lineId: l.line.lineId,
      grossAmount: round2(l.grossAmount),
      itemDiscountAmount: l.itemDiscountAmount,
      schemeDiscountAmount: l.schemeDiscountAmount,
      billDiscountShare,
      taxableValue,
      cgst,
      sgst,
      taxAmount: round2(cgst + sgst),
      lineTotal,
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.grossAmount, 0));
  const itemDiscountTotal = round2(lines.reduce((s, l) => s + l.itemDiscountAmount, 0));
  const schemeDiscountTotal = round2(lines.reduce((s, l) => s + l.schemeDiscountAmount, 0));
  const taxableTotal = round2(lines.reduce((s, l) => s + l.taxableValue, 0));
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  // Indian retail practice: bills settle in whole rupees. Rounding here
  // rather than at print time means the stored total, the credit ledger, the
  // GST exports and the paper the customer holds all carry the same figure.
  // Taxable value and tax are deliberately NOT rounded — only the payable
  // total moves, and the difference is disclosed as `roundOff`.
  const computedTotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const total = Math.round(computedTotal);
  const roundOff = round2(total - computedTotal);

  return {
    lines,
    subtotal,
    itemDiscountTotal,
    schemeDiscountTotal,
    billDiscounts: billDiscountBreakdown,
    billDiscountAmount,
    discountAmount: round2(itemDiscountTotal + schemeDiscountTotal + billDiscountAmount),
    taxableTotal,
    taxAmount,
    roundOff,
    total,
  };
}

/** Effective discount % for manager-PIN-cap comparisons (amount discounts are converted). */
export function effectiveDiscountPercent(
  discount: BillDiscountInput,
  baseAmount: number
): number {
  if (discount.isPercent) return discount.value;
  if (baseAmount <= 0) return 0;
  return (discount.value / baseAmount) * 100;
}
