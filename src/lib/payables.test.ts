import { describe, it, expect } from "vitest";
import { ageCharges } from "@/lib/ageing";

/**
 * Payables reuses the receivables ageing arithmetic. These cases pin the
 * supplier-specific reading of it: a purchase with no terms is due the day
 * it was made, and part-payments clear the oldest bill first.
 */
const day = 86_400_000;
const now = new Date("2026-08-20T12:00:00");
const ago = (d: number) => new Date(now.getTime() - d * day);

describe("supplier ageing", () => {
  it("treats a purchase with no due date as due on the day it was received", () => {
    const aged = ageCharges([{ amount: 5000, dueDate: ago(45) }], 0, now);
    expect(aged.overdue).toBe(5000);
    expect(aged.buckets["31-60"]).toBe(5000);
    expect(aged.oldestOverdueDays).toBe(45);
  });

  it("applies a part-payment to the oldest bill first", () => {
    const aged = ageCharges(
      [
        { amount: 3000, dueDate: ago(70) },
        { amount: 4000, dueDate: ago(10) },
      ],
      3000,
      now
    );
    // The old bill is cleared outright, so nothing sits in 61-90 any more.
    expect(aged.buckets["61-90"]).toBe(0);
    expect(aged.buckets["1-30"]).toBe(4000);
    expect(aged.balance).toBe(4000);
    expect(aged.oldestOverdueDays).toBe(10);
  });

  it("keeps a not-yet-due purchase out of the overdue total", () => {
    const aged = ageCharges(
      [{ amount: 8000, dueDate: new Date(now.getTime() + 15 * day) }],
      0,
      now
    );
    expect(aged.overdue).toBe(0);
    expect(aged.buckets.current).toBe(8000);
    expect(aged.balance).toBe(8000);
  });
});
