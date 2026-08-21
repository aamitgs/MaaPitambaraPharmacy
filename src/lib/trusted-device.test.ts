import { describe, it, expect } from "vitest";
import {
  newDeviceToken, hashDeviceToken, tokenMatchesHash,
  trustExpiry, judgeTrust, daysRemaining,
  TRUST_DAYS, MAX_TRUST_DAYS,
} from "./trusted-device";

const rec = (over: Partial<{ userId: string; expiresAt: Date; revokedAt: Date | null }> = {}) => ({
  userId: "u1",
  expiresAt: new Date("2026-09-05T00:00:00Z"),
  revokedAt: null,
  ...over,
});
const NOW = new Date("2026-08-21T00:00:00Z");

describe("device tokens", () => {
  it("issues a different token every time", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newDeviceToken()));
    expect(seen.size).toBe(200);
  });

  it("stores only a hash, and the hash does not contain the token", () => {
    const t = newDeviceToken();
    const h = hashDeviceToken(t);
    expect(h).toHaveLength(64);
    expect(h).not.toContain(t);
    expect(tokenMatchesHash(t, h)).toBe(true);
  });

  it("rejects a token that is not the one hashed", () => {
    expect(tokenMatchesHash(newDeviceToken(), hashDeviceToken(newDeviceToken()))).toBe(false);
  });

  it("does not throw on a malformed stored hash", () => {
    // A truncated row must fail closed, not crash the sign-in.
    expect(tokenMatchesHash("abc", "not-hex")).toBe(false);
    expect(tokenMatchesHash("abc", "")).toBe(false);
  });
});

describe("how long trust lasts", () => {
  it("defaults to the 15 days the counter asked for", () => {
    expect(TRUST_DAYS).toBe(15);
    const e = trustExpiry(undefined, NOW);
    expect(daysRemaining(e, NOW)).toBe(15);
  });

  it("refuses to trust a device for longer than the cap", () => {
    // A trust outliving the staff member is the failure this guards.
    expect(daysRemaining(trustExpiry(365, NOW), NOW)).toBe(MAX_TRUST_DAYS);
  });

  it("refuses a zero or negative window", () => {
    expect(daysRemaining(trustExpiry(0, NOW), NOW)).toBe(1);
    expect(daysRemaining(trustExpiry(-5, NOW), NOW)).toBe(1);
  });

  it("never reports negative days once expired", () => {
    expect(daysRemaining(new Date("2026-08-01T00:00:00Z"), NOW)).toBe(0);
  });
});

describe("judging a stored trust", () => {
  it("waives the code for a live trust belonging to this user", () => {
    expect(judgeTrust(rec(), "u1", NOW)).toEqual({ trusted: true });
  });

  it("refuses a cookie belonging to another account", () => {
    // The attack: lift the cookie from one login and use it to skip the
    // second factor on someone else's. Existing is not enough — it must
    // be *theirs*.
    expect(judgeTrust(rec({ userId: "u2" }), "u1", NOW)).toEqual({
      trusted: false, reason: "wrong-user",
    });
  });

  it("refuses a revoked device even before its expiry", () => {
    expect(judgeTrust(rec({ revokedAt: new Date("2026-08-20T00:00:00Z") }), "u1", NOW)).toEqual({
      trusted: false, reason: "revoked",
    });
  });

  it("refuses an expired trust, judged on the server clock", () => {
    // The cookie's own max-age is decided by the browser holding it, so
    // expiry is re-checked here rather than trusted.
    expect(judgeTrust(rec({ expiresAt: new Date("2026-08-20T23:59:59Z") }), "u1", NOW)).toEqual({
      trusted: false, reason: "expired",
    });
  });

  it("treats the exact expiry instant as expired, not as one last pass", () => {
    expect(judgeTrust(rec({ expiresAt: NOW }), "u1", NOW).trusted).toBe(false);
  });

  it("refuses when there is no record at all", () => {
    expect(judgeTrust(null, "u1", NOW).trusted).toBe(false);
  });
});
