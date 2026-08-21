import { describe, it, expect } from "vitest";
import { comparePurchase, netCostImpact, hasOvercharge } from "./purchase-variance";

const ordered = (over: Partial<{ itemId: string; itemName: string; qty: number; rate: number }> = {}) => ({
  itemId: "i1", itemName: "Paracetamol 500mg", qty: 100, rate: 28, ...over,
});

describe("comparing a receipt with its order", () => {
  it("says nothing when the invoice matches the order", () => {
    expect(comparePurchase([ordered()], [ordered()])).toEqual([]);
  });

  it("catches a rate charged above the agreed one, and what it costs", () => {
    const v = comparePurchase([ordered()], [ordered({ rate: 32 })]);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("rate-higher");
    // ₹4 more on 100 units.
    expect(v[0].costImpact).toBe(400);
    expect(v[0].message).toContain("ordered at ₹28.00 and invoiced at ₹32.00");
    expect(v[0].message).toContain("costing ₹400.00");
  });

  it("charges the difference on what arrived, not on what was ordered", () => {
    // Ordered 100, only 60 came, at ₹4 over. The overcharge is ₹240.
    const v = comparePurchase([ordered()], [ordered({ qty: 60, rate: 32 })]);
    const rate = v.find((x) => x.kind === "rate-higher")!;
    expect(rate.costImpact).toBe(240);
  });

  it("ignores paise-level differences, which are rounding not overcharging", () => {
    expect(comparePurchase([ordered()], [ordered({ rate: 28.01 })])).toEqual([]);
    expect(comparePurchase([ordered()], [ordered({ rate: 28.02 })])).toHaveLength(1);
  });

  it("notices a better rate too, rather than only bad news", () => {
    const v = comparePurchase([ordered()], [ordered({ rate: 25 })]);
    expect(v[0].kind).toBe("rate-lower");
    expect(v[0].costImpact).toBe(-300);
    expect(v[0].message).toContain("saving ₹300.00");
  });

  it("flags over-delivery and short delivery differently", () => {
    const over = comparePurchase([ordered()], [ordered({ qty: 120 })]);
    expect(over[0].kind).toBe("qty-over");
    expect(over[0].costImpact).toBe(560); // 20 × ₹28

    const short = comparePurchase([ordered()], [ordered({ qty: 80 })]);
    expect(short[0].kind).toBe("qty-short");
    expect(short[0].message).toContain("20 short");
  });

  it("flags a line that was never ordered at all", () => {
    const v = comparePurchase([ordered()], [ordered(), { itemId: "i2", itemName: "Cough Syrup", qty: 10, rate: 60 }]);
    const extra = v.find((x) => x.kind === "not-ordered")!;
    expect(extra.itemName).toBe("Cough Syrup");
    expect(extra.costImpact).toBe(600);
  });

  it("reports an ordered line that never arrived", () => {
    const v = comparePurchase([ordered(), { itemId: "i2", itemName: "Cough Syrup", qty: 10, rate: 60 }], [ordered()]);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe("qty-short");
    expect(v[0].message).toContain("none received");
  });

  it("adds up repeated lines for the same item before comparing", () => {
    const v = comparePurchase(
      [ordered({ qty: 60 }), ordered({ qty: 40 })],
      [ordered({ qty: 100 })]
    );
    expect(v).toEqual([]);
  });
});

describe("net cost impact", () => {
  it("does not let a short delivery cancel out an overcharge", () => {
    // The classic wrong answer: −₹560 short + ₹400 overcharge = "−₹160,
    // fine". The pharmacy is still being overcharged ₹400 on what it got.
    const v = comparePurchase(
      [ordered(), { itemId: "i2", itemName: "Cough Syrup", qty: 20, rate: 28 }],
      [ordered({ rate: 32 })]
    );
    expect(netCostImpact(v)).toBe(400);
    expect(hasOvercharge(v)).toBe(true);
  });

  it("is zero and quiet on a clean receipt", () => {
    const v = comparePurchase([ordered()], [ordered()]);
    expect(netCostImpact(v)).toBe(0);
    expect(hasOvercharge(v)).toBe(false);
  });

  it("does not call a short delivery an overcharge", () => {
    const v = comparePurchase([ordered()], [ordered({ qty: 80 })]);
    expect(hasOvercharge(v)).toBe(false);
  });
});
