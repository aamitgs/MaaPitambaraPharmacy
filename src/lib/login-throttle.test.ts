import { describe, it, expect } from "vitest";
import {
  lockoutMinutesFor,
  nextFailureState,
  isLocked,
  hasDecayed,
  humanizeWait,
  FREE_ATTEMPTS,
} from "./login-throttle";

const NOW = new Date("2026-08-20T10:00:00Z");
const state = (over: Partial<Parameters<typeof isLocked>[0]> = {}) => ({
  failedLoginCount: 0,
  lastFailedLoginAt: null,
  lockedUntil: null,
  ...over,
});

describe("login throttle", () => {
  it("lets a few typos through without locking", () => {
    for (let n = 1; n <= FREE_ATTEMPTS; n++) {
      expect(lockoutMinutesFor(n), `attempt ${n}`).toBe(0);
    }
  });

  it("backs off by doubling, capped at a quarter hour", () => {
    expect(lockoutMinutesFor(5)).toBe(1);
    expect(lockoutMinutesFor(6)).toBe(2);
    expect(lockoutMinutesFor(7)).toBe(4);
    expect(lockoutMinutesFor(8)).toBe(8);
    expect(lockoutMinutesFor(9)).toBe(15);
    expect(lockoutMinutesFor(50)).toBe(15);
  });

  it("makes a brute-force run hopeless", () => {
    // Ten minutes of sustained guessing buys nowhere near a 6-digit code
    // space, which is the whole point of throttling the TOTP step too.
    let attempts = 0;
    let elapsedMs = 0;
    let s = state();
    while (elapsedMs < 10 * 60 * 1000 && attempts < 10_000) {
      const next = nextFailureState(s, new Date(NOW.getTime() + elapsedMs));
      attempts++;
      s = { ...next };
      if (next.lockedUntil) elapsedMs = next.lockedUntil.getTime() - NOW.getTime();
    }
    expect(attempts).toBeLessThan(15);
  });

  it("counts up and locks on the fifth failure", () => {
    let s = state();
    for (let i = 0; i < 4; i++) s = { ...nextFailureState(s, NOW) };
    expect(s.failedLoginCount).toBe(4);
    expect(s.lockedUntil).toBeNull();

    s = { ...nextFailureState(s, NOW) };
    expect(s.failedLoginCount).toBe(5);
    expect(s.lockedUntil).not.toBeNull();
    expect(isLocked(s, NOW)).toBe(true);
    expect(isLocked(s, new Date(NOW.getTime() + 61_000))).toBe(false);
  });

  it("forgets an old run of failures", () => {
    const old = new Date(NOW.getTime() - 31 * 60 * 1000);
    const s = state({ failedLoginCount: 4, lastFailedLoginAt: old });
    expect(hasDecayed(s, NOW)).toBe(true);
    // Starts from one again rather than tipping straight into a lockout.
    expect(nextFailureState(s, NOW).failedLoginCount).toBe(1);
  });

  it("keeps counting inside the decay window", () => {
    const recent = new Date(NOW.getTime() - 5 * 60 * 1000);
    const s = state({ failedLoginCount: 4, lastFailedLoginAt: recent });
    expect(hasDecayed(s, NOW)).toBe(false);
    expect(nextFailureState(s, NOW).failedLoginCount).toBe(5);
  });

  it("phrases the wait for a human", () => {
    expect(humanizeWait(1)).toBe("1 second");
    expect(humanizeWait(45)).toBe("45 seconds");
    expect(humanizeWait(61)).toBe("2 minutes");
    expect(humanizeWait(900)).toBe("15 minutes");
  });
});
