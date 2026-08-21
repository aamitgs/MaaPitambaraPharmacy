import { describe, it, expect } from "vitest";
import { ageCharges, bucketFor } from "./ageing";

const NOW = new Date("2026-08-20T12:00:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("ageing buckets", () => {
  it("puts a charge in the right bucket", () => {
    expect(bucketFor(-5)).toBe("current");
    expect(bucketFor(0)).toBe("current");
    expect(bucketFor(1)).toBe("1-30");
    expect(bucketFor(30)).toBe("1-30");
    expect(bucketFor(31)).toBe("31-60");
    expect(bucketFor(91)).toBe("90+");
  });
});

describe("ageCharges", () => {
  it("settles the oldest charge first", () => {
    // 1000 owed across two charges, 600 paid. The old one clears and the
    // remainder sits against the newer — not the other way round, which
    // would leave an ancient charge on the books forever.
    const r = ageCharges(
      [
        { amount: 500, dueDate: daysAgo(70) },
        { amount: 500, dueDate: daysAgo(10) },
      ],
      600,
      NOW
    );
    expect(r.balance).toBe(400);
    expect(r.buckets["61-90"]).toBe(0);
    expect(r.buckets["1-30"]).toBe(400);
    expect(r.oldestOverdueDays).toBe(10);
  });

  it("does not treat a not-yet-due charge as overdue", () => {
    const r = ageCharges([{ amount: 200, dueDate: daysAhead(5) }], 0, NOW);
    expect(r.buckets.current).toBe(200);
    expect(r.overdue).toBe(0);
    expect(r.oldestOverdueDays).toBe(0);
  });

  it("separates the overdue part from the balance", () => {
    const r = ageCharges(
      [
        { amount: 100, dueDate: daysAgo(40) },
        { amount: 250, dueDate: daysAhead(10) },
      ],
      0,
      NOW
    );
    expect(r.balance).toBe(350);
    expect(r.overdue).toBe(100);
    expect(r.buckets["31-60"]).toBe(100);
    expect(r.buckets.current).toBe(250);
  });

  it("clears everything when payment covers the lot", () => {
    const r = ageCharges(
      [
        { amount: 300, dueDate: daysAgo(90) },
        { amount: 200, dueDate: daysAgo(5) },
      ],
      500,
      NOW
    );
    expect(r.balance).toBe(0);
    expect(r.overdue).toBe(0);
    expect(r.oldestOverdueDays).toBe(0);
  });

  it("leaves no phantom charge from floating-point residue", () => {
    // Three 0.1 charges paid with 0.3 — in binary floating point the
    // subtraction leaves a sliver that must not show as an unpaid charge.
    const r = ageCharges(
      [
        { amount: 0.1, dueDate: daysAgo(40) },
        { amount: 0.1, dueDate: daysAgo(30) },
        { amount: 0.1, dueDate: daysAgo(20) },
      ],
      0.3,
      NOW
    );
    expect(r.balance).toBe(0);
  });

  it("ignores the order charges are supplied in", () => {
    const charges = [
      { amount: 500, dueDate: daysAgo(10) },
      { amount: 500, dueDate: daysAgo(70) },
    ];
    const r = ageCharges(charges, 600, NOW);
    expect(r.buckets["1-30"]).toBe(400);
    expect(r.buckets["61-90"]).toBe(0);
  });

  it("copes with an overpayment", () => {
    const r = ageCharges([{ amount: 100, dueDate: daysAgo(5) }], 250, NOW);
    expect(r.balance).toBe(0);
  });
});
