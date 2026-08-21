import { describe, it, expect } from "vitest";
import { planRedaction, MINIMUM_RETENTION_YEARS, RETENTION_FLOORS } from "./retention";

describe("retention floors", () => {
  it("takes the longest statutory minimum, not the shortest", () => {
    // The H1 register is 3 years, GST 6. Applying 3 to everything would
    // destroy GST records the law still requires.
    expect(RETENTION_FLOORS.scheduleH1Years).toBe(3);
    expect(RETENTION_FLOORS.gstRecordYears).toBe(6);
    expect(MINIMUM_RETENTION_YEARS).toBe(6);
  });
});

describe("planning a redaction", () => {
  const now = new Date("2026-08-20T12:00:00");

  it("refuses a window shorter than the law allows, and says why", () => {
    const d = planRedaction(3, now);
    expect(d.redact).toBe(false);
    if (!d.redact) {
      expect(d.reason).toContain("6 years");
      expect(d.reason).toContain("65(11A)");
      expect(d.reason).toContain("CGST");
    }
  });

  it("does not silently clamp a too-short window up to the legal minimum", () => {
    // Quietly substituting 6 for 2 would mean the owner believes they
    // cleared two-year-old data when they did not.
    expect(planRedaction(2, now).redact).toBe(false);
  });

  it("allows the statutory minimum exactly", () => {
    const d = planRedaction(6, now);
    expect(d.redact).toBe(true);
    if (d.redact) expect(d.cutoff.getFullYear()).toBe(2020);
  });

  it("counts back in whole years from today", () => {
    const d = planRedaction(10, now);
    if (d.redact) {
      expect(d.cutoff.getFullYear()).toBe(2016);
      expect(d.cutoff.getMonth()).toBe(7); // August
      expect(d.cutoff.getDate()).toBe(20);
    }
  });

  it("rejects nonsense rather than computing a cutoff from it", () => {
    expect(planRedaction(0, now).redact).toBe(false);
    expect(planRedaction(-5, now).redact).toBe(false);
    expect(planRedaction(Number.NaN, now).redact).toBe(false);
  });
});
