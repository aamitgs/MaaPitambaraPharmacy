import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * "Don't ask me for a code on this device."
 *
 * The rule this encodes: trusting a device waives the *second* factor, never
 * the first. Someone holding the laptop still has to know the password, so a
 * trusted device is worth no more than a stolen password — and considerably
 * less than the OTP app, which never leaves the phone.
 *
 * Everything here is deliberately pure so the expiry and comparison rules can
 * be tested without a database or a browser.
 */

/** How long a device stays trusted. The counter staff's working answer. */
export const TRUST_DAYS = 15;

/**
 * The longest anyone may extend it to. A trust that outlives the staff
 * member's employment is the failure case; a month is already generous for
 * a machine sitting on a shop counter.
 */
export const MAX_TRUST_DAYS = 30;

export const TRUST_COOKIE = "mpp_trusted_device";

/** 32 bytes of randomness — guessing is not a threat model at this size. */
export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Stored hashed, exactly like a session token.
 *
 * SHA-256 rather than bcrypt on purpose: the input is 256 bits of entropy we
 * generated, not a human password, so there is nothing for a slow hash to
 * defend against — and this runs on every sign-in.
 */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare, so a near-miss cannot be found by timing. */
export function tokenMatchesHash(token: string, hash: string): boolean {
  const a = Buffer.from(hashDeviceToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function trustExpiry(days: number = TRUST_DAYS, from: Date = new Date()): Date {
  const clamped = Math.min(Math.max(Math.floor(days), 1), MAX_TRUST_DAYS);
  return new Date(from.getTime() + clamped * 24 * 60 * 60 * 1000);
}

export type TrustRecord = {
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type TrustVerdict =
  | { trusted: true }
  | { trusted: false; reason: "expired" | "revoked" | "wrong-user" };

/**
 * Whether a stored trust still lets this user skip the code.
 *
 * The user check is the important one: a cookie lifted from one account must
 * not waive the second factor on another, so the record's owner has to match
 * the account being signed into — not merely exist.
 *
 * Expiry is judged here, against the server's clock, and never left to the
 * cookie's own max-age, which the browser holding it decides.
 */
export function judgeTrust(
  record: TrustRecord | null,
  userId: string,
  now: Date = new Date()
): TrustVerdict {
  if (!record) return { trusted: false, reason: "expired" };
  if (record.userId !== userId) return { trusted: false, reason: "wrong-user" };
  if (record.revokedAt) return { trusted: false, reason: "revoked" };
  if (record.expiresAt.getTime() <= now.getTime()) return { trusted: false, reason: "expired" };
  return { trusted: true };
}

/** Days left, for the security screen. Never negative. */
export function daysRemaining(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000));
}
