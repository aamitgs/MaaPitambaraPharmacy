import { describe, it, expect } from "vitest";
import { computeBilling, effectiveDiscountPercent, type BillingLineInput } from "./billing";

const line = (over: Partial<BillingLineInput> = {}): BillingLineInput => ({
  lineId: "l1",
  qty: 1,
  rate: 100,
  taxRate: 12,
  discountPercent: 0,
  ...over,
});

/**
 * The money path. Every one of these is a figure a customer holds on paper
 * or an accountant files, so the assertions are exact — no tolerance.
 */
describe("computeBilling", () => {
  it("splits GST evenly into CGST and SGST", () => {
    const r = computeBilling([line({ rate: 100, taxRate: 12 })], []);
    expect(r.lines[0].cgst).toBe(6);
    expect(r.lines[0].sgst).toBe(6);
    expect(r.lines[0].cgst + r.lines[0].sgst).toBe(r.lines[0].taxAmount);
  });

  it("never loses a paisa in the CGST/SGST split on an odd tax", () => {
    // 5% on 99 is 4.95 — an odd number of paise, so a naive halve-and-round
    // twice would report 2.48 + 2.48 = 4.96 and overstate the tax.
    const r = computeBilling([line({ rate: 99, taxRate: 5 })], []);
    expect(r.lines[0].cgst + r.lines[0].sgst).toBe(r.lines[0].taxAmount);
  });

  it("settles on a whole rupee and discloses the adjustment", () => {
    const r = computeBilling([line({ rate: 28, taxRate: 12 })], []);
    // 28 + 12% = 31.36, so the customer pays 31 and the bill shows -0.36.
    expect(r.total).toBe(31);
    expect(r.roundOff).toBe(-0.36);
    expect(Number.isInteger(r.total)).toBe(true);
  });

  it("keeps taxable value and tax unrounded while only the total moves", () => {
    const r = computeBilling([line({ rate: 28, taxRate: 12 })], []);
    expect(r.taxableTotal).toBe(28);
    expect(r.taxAmount).toBe(3.36);
    // The disclosed round-off must exactly reconcile the two.
    expect(r.total - r.roundOff).toBeCloseTo(r.taxableTotal + r.taxAmount, 10);
  });

  it("applies an item discount before tax", () => {
    const r = computeBilling([line({ rate: 100, taxRate: 12, discountPercent: 10 })], []);
    expect(r.lines[0].itemDiscountAmount).toBe(10);
    expect(r.lines[0].taxableValue).toBe(90);
    expect(r.lines[0].taxAmount).toBe(10.8);
  });

  it("stacks bill discounts off the same base rather than compounding", () => {
    // 10% loyalty and 10% coupon on 100 must take 20, not 19 (which is what
    // applying the second to the already-discounted 90 would give).
    const r = computeBilling(
      [line({ rate: 100, taxRate: 0 })],
      [
        { type: "loyalty", isPercent: true, value: 10 },
        { type: "coupon", isPercent: true, value: 10 },
      ]
    );
    expect(r.billDiscountAmount).toBe(20);
    expect(r.taxableTotal).toBe(80);
  });

  it("scales discounts down instead of letting a bill go negative", () => {
    const r = computeBilling(
      [line({ rate: 100, taxRate: 0 })],
      [
        { type: "bill", isPercent: false, value: 80 },
        { type: "coupon", isPercent: false, value: 80 },
      ]
    );
    expect(r.billDiscountAmount).toBeLessThanOrEqual(100);
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.taxableTotal).toBeGreaterThanOrEqual(0);
  });

  it("never produces a negative total from an oversized flat discount", () => {
    const r = computeBilling(
      [line({ rate: 50, taxRate: 12 })],
      [{ type: "bill", isPercent: false, value: 9999 }]
    );
    expect(r.total).toBeGreaterThanOrEqual(0);
  });

  it("caps a scheme discount at the line's own value", () => {
    const r = computeBilling(
      [line({ rate: 100, taxRate: 0, schemeDiscountAmount: 500 })],
      []
    );
    expect(r.lines[0].schemeDiscountAmount).toBe(100);
    expect(r.lines[0].taxableValue).toBe(0);
  });

  it("adds line totals up to the bill total, before rounding", () => {
    const r = computeBilling(
      [
        line({ lineId: "a", qty: 2, rate: 95, taxRate: 12 }),
        line({ lineId: "b", qty: 1, rate: 28, taxRate: 12 }),
        line({ lineId: "c", qty: 3, rate: 12.5, taxRate: 5 }),
      ],
      [{ type: "bill", isPercent: true, value: 5 }]
    );
    const sumOfLines = r.lines.reduce((s, l) => s + l.lineTotal, 0);
    expect(Math.round(sumOfLines)).toBe(r.total);
    // And the discount breakdown must reconcile with the headline figure.
    const breakdown = r.billDiscounts.reduce((s, d) => s + d.amount, 0);
    expect(breakdown).toBeCloseTo(r.billDiscountAmount, 2);
  });

  it("handles an empty cart without dividing by zero", () => {
    const r = computeBilling([], [{ type: "bill", isPercent: true, value: 10 }]);
    expect(r.total).toBe(0);
    expect(r.billDiscountAmount).toBe(0);
    expect(Number.isNaN(r.taxableTotal)).toBe(false);
  });

  it("handles a zero-rated (exempt) item", () => {
    const r = computeBilling([line({ rate: 100, taxRate: 0 })], []);
    expect(r.taxAmount).toBe(0);
    expect(r.total).toBe(100);
  });
});

describe("effectiveDiscountPercent", () => {
  it("passes a percent discount straight through", () => {
    expect(effectiveDiscountPercent({ isPercent: true, value: 15 }, 500)).toBe(15);
  });

  it("converts a flat discount so the manager-PIN cap can compare like with like", () => {
    expect(effectiveDiscountPercent({ isPercent: false, value: 50 }, 500)).toBe(10);
  });

  it("does not divide by zero on an empty cart", () => {
    expect(effectiveDiscountPercent({ isPercent: false, value: 50 }, 0)).toBe(0);
  });
});
