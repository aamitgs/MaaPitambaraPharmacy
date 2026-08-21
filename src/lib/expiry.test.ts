import { describe, it, expect } from "vitest";
import { isBatchExpired, daysUntilExpiry } from "./expiry";

describe("batch expiry", () => {
  it("keeps a batch sellable through the end of its expiry month", () => {
    // A carton printed "06/27" is good all through June, whatever day the
    // stored date happens to be.
    const firstOfJune = new Date(2027, 5, 1);
    expect(isBatchExpired(firstOfJune, new Date(2027, 5, 2))).toBe(false);
    expect(isBatchExpired(firstOfJune, new Date(2027, 5, 30))).toBe(false);
  });

  it("expires it the moment the next month starts", () => {
    const june2027 = new Date(2027, 5, 30);
    expect(isBatchExpired(june2027, new Date(2027, 5, 30, 23, 59))).toBe(false);
    expect(isBatchExpired(june2027, new Date(2027, 6, 1, 0, 1))).toBe(true);
  });

  it("handles February in a leap year", () => {
    const feb2028 = new Date(2028, 1, 1);
    expect(isBatchExpired(feb2028, new Date(2028, 1, 29))).toBe(false);
    expect(isBatchExpired(feb2028, new Date(2028, 2, 1))).toBe(true);
  });

  it("treats an old batch as expired", () => {
    expect(isBatchExpired(new Date(2020, 0, 15), new Date(2026, 7, 20))).toBe(true);
  });

  it("counts days to the end of the expiry month", () => {
    expect(daysUntilExpiry(new Date(2026, 8, 15), new Date(2026, 8, 20))).toBe(10);
    expect(daysUntilExpiry(new Date(2026, 7, 1), new Date(2026, 8, 20))).toBeLessThan(0);
  });
});
