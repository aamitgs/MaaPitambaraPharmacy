import "server-only";

/**
 * Sign-in throttling.
 *
 * Without it the till accepts unlimited password guesses, and — worse —
 * unlimited authenticator-code guesses once a password is known. A 6-digit
 * TOTP is only a million possibilities, and the codes for a given window
 * are static; at unlimited request rates that is minutes of work, not
 * years. Password and code failures therefore share one counter.
 *
 * Lockout is per account rather than per IP on purpose: this app runs on a
 * shop LAN behind one NAT address, so every till would share an IP bucket
 * and one typo-prone member of staff would lock out the whole counter.
 */

/** Failures allowed before the first lockout. */
export const FREE_ATTEMPTS = 4;

/** A quiet spell wipes the slate — this is about bursts, not lifetime typos. */
const DECAY_MINUTES = 30;

const MAX_LOCK_MINUTES = 15;

/**
 * Doubling backoff, capped. Attempt 5 costs a minute; by attempt 9 it is a
 * quarter hour, which makes an online guessing run pointless while leaving
 * a member of staff who fumbled their password a short wait.
 */
export function lockoutMinutesFor(failureCount: number): number {
  if (failureCount <= FREE_ATTEMPTS) return 0;
  const step = failureCount - FREE_ATTEMPTS - 1;
  return Math.min(2 ** step, MAX_LOCK_MINUTES);
}

export type ThrottleState = {
  failedLoginCount: number;
  lastFailedLoginAt: Date | null;
  lockedUntil: Date | null;
};

export function isLocked(state: ThrottleState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

export function lockRemainingSeconds(state: ThrottleState, now: Date = new Date()): number {
  if (!state.lockedUntil || state.lockedUntil <= now) return 0;
  return Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000);
}

/** Whether the previous run of failures is old enough to forget. */
export function hasDecayed(state: ThrottleState, now: Date = new Date()): boolean {
  if (!state.lastFailedLoginAt) return true;
  return now.getTime() - state.lastFailedLoginAt.getTime() > DECAY_MINUTES * 60 * 1000;
}

/** The next counter and lock time after one more failure. */
export function nextFailureState(
  state: ThrottleState,
  now: Date = new Date()
): { failedLoginCount: number; lastFailedLoginAt: Date; lockedUntil: Date | null } {
  const base = hasDecayed(state, now) ? 0 : state.failedLoginCount;
  const failedLoginCount = base + 1;
  const minutes = lockoutMinutesFor(failedLoginCount);
  return {
    failedLoginCount,
    lastFailedLoginAt: now,
    lockedUntil: minutes > 0 ? new Date(now.getTime() + minutes * 60 * 1000) : null,
  };
}

export { humanizeWait } from "./login-throttle-format";
