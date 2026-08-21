import { describe, it, expect } from "vitest";
import { suggestReorderQty } from "./reorder";

describe("reorder suggestions", () => {
  it("tops a slow mover up to its reorder level, no further", () => {
    // Two sold in 30 days against a reorder level of 10: the level is what
    // binds, not velocity — otherwise slow stock gets ordered into expiry.
    const r = suggestReorderQty({
      currentQty: 3,
      reorderLevel: 10,
      soldInWindow: 2,
      windowDays: 30,
    });
    expect(r.basis).toBe("reorder-level");
    expect(r.suggestedQty).toBe(7);
  });

  it("orders to cover demand when an item sells faster than its level implies", () => {
    // 5/day with only 10 on the shelf: the reorder level of 20 would order
    // 10, which is two days of stock.
    const r = suggestReorderQty({
      currentQty: 10,
      reorderLevel: 20,
      soldInWindow: 150,
      windowDays: 30,
      coverDays: 30,
    });
    expect(r.basis).toBe("velocity");
    expect(r.dailyVelocity).toBe(5);
    expect(r.suggestedQty).toBe(140); // 5 * 30 - 10
  });

  it("reports how long current stock lasts", () => {
    const r = suggestReorderQty({
      currentQty: 30,
      reorderLevel: 10,
      soldInWindow: 60,
      windowDays: 30,
    });
    expect(r.dailyVelocity).toBe(2);
    expect(r.daysOfCover).toBe(15);
  });

  it("suggests nothing when stock is comfortable", () => {
    const r = suggestReorderQty({
      currentQty: 500,
      reorderLevel: 10,
      soldInWindow: 30,
      windowDays: 30,
    });
    expect(r.suggestedQty).toBe(0);
    expect(r.basis).toBe("minimum");
  });

  it("says days-of-cover is unknown rather than infinite for a dead item", () => {
    const r = suggestReorderQty({
      currentQty: 5,
      reorderLevel: 10,
      soldInWindow: 0,
      windowDays: 30,
    });
    expect(r.daysOfCover).toBeNull();
    expect(r.suggestedQty).toBe(5);
  });

  it("rounds up to whole packs", () => {
    const r = suggestReorderQty({
      currentQty: 0,
      reorderLevel: 7,
      soldInWindow: 0,
      windowDays: 30,
      packMultiple: 10,
    });
    expect(r.suggestedQty).toBe(10);
  });

  it("never suggests a negative quantity", () => {
    const r = suggestReorderQty({
      currentQty: 1000,
      reorderLevel: 5,
      soldInWindow: 1,
      windowDays: 30,
    });
    expect(r.suggestedQty).toBeGreaterThanOrEqual(0);
  });

  it("does not divide by zero on an empty window", () => {
    const r = suggestReorderQty({
      currentQty: 0,
      reorderLevel: 5,
      soldInWindow: 10,
      windowDays: 0,
    });
    expect(Number.isFinite(r.dailyVelocity)).toBe(true);
    expect(r.suggestedQty).toBe(5);
  });
});
