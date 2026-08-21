import { describe, it, expect } from "vitest";
import { judgeStaleness } from "./staleness";

const HOUR = 3_600_000;

describe("offline sale staleness", () => {
  const now = new Date("2026-08-20T14:00:00").getTime();

  it("lets a sale from an hour ago sync without comment", () => {
    const v = judgeStaleness(now - 1 * HOUR, 12, now);
    expect(v.stale).toBe(false);
    expect(v.reason).toBeUndefined();
  });

  it("holds a sale that has sat past the window", () => {
    const v = judgeStaleness(now - 20 * HOUR, 12, now);
    expect(v.stale).toBe(true);
    expect(v.reason).toContain("20 hours");
    expect(v.reason).toContain("Stock and prices may have moved");
  });

  it("counts in days once it is past two", () => {
    expect(judgeStaleness(now - 72 * HOUR, 12, now).reason).toContain("3 days");
    expect(judgeStaleness(now - 24 * HOUR, 12, now).reason).toContain("24 hours");
    // Singular reads as a sentence, not as a template.
    expect(judgeStaleness(now - 49 * HOUR, 48, now).reason).toContain("2 days");
    expect(judgeStaleness(now - 13 * HOUR, 12, now).reason).toContain("13 hours");
    expect(judgeStaleness(now - 1.4 * HOUR, 1, now).reason).toContain("1 hour ago");
  });

  it("says so explicitly when the sale belongs to a filed GST period", () => {
    // Rung up 31 July, syncing 20 August: a different return entirely.
    const july = new Date("2026-07-31T20:00:00").getTime();
    const v = judgeStaleness(july, 12, now);
    expect(v.stale).toBe(true);
    expect(v.reason).toContain("different month");
    expect(v.reason).toContain("GST return");
  });

  it("treats the boundary as still fresh", () => {
    expect(judgeStaleness(now - 12 * HOUR, 12, now).stale).toBe(false);
    expect(judgeStaleness(now - 12.1 * HOUR, 12, now).stale).toBe(true);
  });

  it("does not trip on a clock that has drifted backwards", () => {
    // A shop PC whose clock resets is common enough; a negative age must
    // not read as an enormous one.
    const v = judgeStaleness(now + 5 * HOUR, 12, now);
    expect(v.stale).toBe(false);
    expect(v.ageHours).toBe(0);
  });
});
