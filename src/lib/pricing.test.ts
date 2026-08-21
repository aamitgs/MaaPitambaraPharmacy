import { describe, it, expect } from "vitest";
import { rateFor, effectiveBasis, lineMargin } from "./pricing";

const batch = { saleRate: 100, ptr: 78 };
const retailOnly = { saleRate: 100, ptr: null };

describe("rateFor", () => {
  it("uses the retail rate for a retail sale", () => {
    expect(rateFor(batch, "mrp")).toBe(100);
  });

  it("uses PTR for a wholesale sale", () => {
    expect(rateFor(batch, "ptr")).toBe(78);
  });

  it("falls back to retail when PTR was never set", () => {
    // Refusing the sale would be worse than billing at retail, and the
    // bill shows which was used either way.
    expect(rateFor(retailOnly, "ptr")).toBe(100);
    expect(effectiveBasis(retailOnly, "ptr")).toBe("mrp");
  });

  it("treats a zero PTR as unset rather than free", () => {
    expect(rateFor({ saleRate: 100, ptr: 0 }, "ptr")).toBe(100);
    expect(effectiveBasis({ saleRate: 100, ptr: 0 }, "ptr")).toBe("mrp");
  });

  it("records what was actually applied", () => {
    expect(effectiveBasis(batch, "ptr")).toBe("ptr");
    expect(effectiveBasis(batch, "mrp")).toBe("mrp");
  });
});

describe("lineMargin", () => {
  it("computes retail margin", () => {
    const m = lineMargin(100, 60, 2);
    expect(m.revenue).toBe(200);
    expect(m.cost).toBe(120);
    expect(m.margin).toBe(80);
    expect(m.marginPercent).toBe(40);
  });

  it("shows wholesale margin as the thin thing it is", () => {
    // 78 against a 72 cost is 7.7%, not the 40% the same batch earns at
    // retail — which is exactly why the two must not be averaged.
    const m = lineMargin(78, 72, 1);
    expect(m.margin).toBe(6);
    expect(m.marginPercent).toBe(7.7);
  });

  it("does not divide by zero on a free line", () => {
    expect(lineMargin(0, 10, 1).marginPercent).toBe(0);
  });

  it("reports a loss as negative rather than clamping", () => {
    const m = lineMargin(50, 60, 1);
    expect(m.margin).toBe(-10);
    expect(m.marginPercent).toBe(-20);
  });
});
