import { describe, it, expect } from "vitest";
import {
  toLocalDateString,
  defaultMonthRange,
  parseLocalDate,
  localDateWindow,
} from "./date-range";

describe("report date ranges", () => {
  it("reports the local calendar date, not the UTC one", () => {
    // 02:45 on the 20th in IST is still the 19th in UTC. A pharmacy open at
    // that hour must not have its night trade fall outside "this month to
    // date" — which is exactly what toISOString().slice(0,10) did.
    const earlyMorningIst = new Date("2026-08-20T02:45:00+05:30");
    expect(earlyMorningIst.toISOString().slice(0, 10)).toBe("2026-08-19");

    // Only meaningful when the test process is actually running in a
    // timezone ahead of UTC, which is the case this guards.
    if (earlyMorningIst.getHours() === 2 && earlyMorningIst.getDate() === 20) {
      expect(toLocalDateString(earlyMorningIst)).toBe("2026-08-20");
    }
  });

  it("pads single-digit months and days", () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("starts the default range on the first of the local month", () => {
    const { from, to } = defaultMonthRange({});
    expect(from.endsWith("-01")).toBe(true);
    expect(from <= to).toBe(true);
    expect(to).toBe(toLocalDateString(new Date()));
  });

  it("passes explicit params straight through", () => {
    expect(defaultMonthRange({ from: "2026-01-01", to: "2026-01-31" })).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });
});

describe("parseLocalDate", () => {
  it("treats a date string as local midnight, not UTC", () => {
    // The bug this exists for: new Date("2026-08-01") is UTC midnight,
    // which is 05:30 on the 1st in IST — so a report starting "1 Aug"
    // silently began at 05:30 and dropped the night's trade.
    const local = parseLocalDate("2026-08-01");
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(7);
    expect(local.getDate()).toBe(1);
    expect(local.getHours()).toBe(0);
  });

  it("matches what an action writes for the same date", () => {
    // Actions store dates with new Date(y, m-1, d). A filter parsed any
    // other way cannot find them.
    expect(parseLocalDate("2026-08-01").getTime()).toBe(new Date(2026, 7, 1).getTime());
  });

  it("covers the whole of both end days", () => {
    const { fromDate, toDate } = localDateWindow("2026-08-01", "2026-08-31");
    // A sale at one minute past midnight on the first day is inside.
    expect(new Date(2026, 7, 1, 0, 1) >= fromDate).toBe(true);
    // And one at 23:59 on the last day.
    expect(new Date(2026, 7, 31, 23, 59) <= toDate).toBe(true);
    // But not the day either side.
    expect(new Date(2026, 6, 31, 23, 59) >= fromDate).toBe(false);
    expect(new Date(2026, 8, 1, 0, 1) <= toDate).toBe(false);
  });

  it("handles a single-day range", () => {
    const { fromDate, toDate } = localDateWindow("2026-08-20", "2026-08-20");
    expect(new Date(2026, 7, 20, 9, 0) >= fromDate).toBe(true);
    expect(new Date(2026, 7, 20, 9, 0) <= toDate).toBe(true);
  });
});
