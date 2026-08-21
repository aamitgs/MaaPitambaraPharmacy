/**
 * Shared between the sign-in screen (a client component) and the server.
 * Kept out of `login-throttle.ts` because that file is `server-only` — the
 * throttling decisions must never ship to the browser, but the wording of
 * the wait has to.
 */
export function humanizeWait(seconds: number): string {
  if (seconds <= 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
