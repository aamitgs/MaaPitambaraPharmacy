import { describe, it, expect } from "vitest";
import {
  turnoverStatus,
  partyStatus,
  tcsOn,
  financialYearOf,
  TURNOVER_THRESHOLD,
  PARTY_THRESHOLD,
} from "./thresholds";

describe("turnover thresholds", () => {
  it("says not-applicable for an ordinary pharmacy", () => {
    expect(turnoverStatus(1_630)).toBe("not-applicable");
    expect(turnoverStatus(50_000_000)).toBe("not-applicable"); // ₹5 crore
  });

  it("warns before the line, not after", () => {
    expect(turnoverStatus(TURNOVER_THRESHOLD * 0.8)).toBe("approaching");
    expect(turnoverStatus(TURNOVER_THRESHOLD - 1)).toBe("approaching");
    expect(turnoverStatus(TURNOVER_THRESHOLD)).toBe("crossed");
  });

  it("tracks a single party the same way", () => {
    expect(partyStatus(1_000_000)).toBe("not-applicable");
    expect(partyStatus(PARTY_THRESHOLD * 0.9)).toBe("approaching");
    expect(partyStatus(PARTY_THRESHOLD + 1)).toBe("crossed");
  });
});

describe("tcsOn", () => {
  it("charges nothing up to the threshold", () => {
    expect(tcsOn(PARTY_THRESHOLD)).toBe(0);
    expect(tcsOn(1_000_000)).toBe(0);
  });

  it("applies 0.1% to the excess only, not the whole amount", () => {
    // ₹60 lakh means ₹10 lakh over, so ₹1,000 — not ₹6,000.
    expect(tcsOn(6_000_000)).toBe(1000);
  });
});

describe("financialYearOf", () => {
  it("runs April to March", () => {
    const fy = financialYearOf(new Date(2026, 7, 20)); // Aug 2026
    expect(fy.label).toBe("FY 2026-27");
    expect(fy.start.getMonth()).toBe(3);
    expect(fy.end.getMonth()).toBe(2);
  });

  it("puts January in the previous year's FY", () => {
    // A common off-by-one: Jan 2027 belongs to FY 2026-27, not 2027-28.
    expect(financialYearOf(new Date(2027, 0, 15)).label).toBe("FY 2026-27");
    expect(financialYearOf(new Date(2027, 2, 31)).label).toBe("FY 2026-27");
    expect(financialYearOf(new Date(2027, 3, 1)).label).toBe("FY 2027-28");
  });
});
