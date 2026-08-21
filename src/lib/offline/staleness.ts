/**
 * How long a queued offline sale may wait before it stops posting itself.
 *
 * A sale rung up while the line is down is a real sale — it has been paid
 * for and the medicine has left the shelf — so it is never discarded. But
 * replaying it days later is not the same thing as replaying it minutes
 * later:
 *
 *  - it consumes stock that has since been sold, counted or written off;
 *  - it bills at a rate the batch no longer carries;
 *  - and if it crosses a month boundary it lands in a GST return that has
 *    already been filed.
 *
 * So past the window, syncing stops being automatic and becomes a decision
 * someone makes with their eyes open.
 */

export type StalenessVerdict = {
  stale: boolean;
  ageHours: number;
  /// Filled in only when stale — what the counter is being asked to judge.
  reason?: string;
};

export function judgeStaleness(
  queuedAt: number,
  maxHours: number,
  now: number = Date.now()
): StalenessVerdict {
  const ageHours = Math.max(0, (now - queuedAt) / 3_600_000);
  if (ageHours <= maxHours) return { stale: false, ageHours };

  const queued = new Date(queuedAt);
  const current = new Date(now);
  const crossesMonth =
    queued.getMonth() !== current.getMonth() || queued.getFullYear() !== current.getFullYear();

  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const age =
    ageHours < 48
      ? plural(Math.round(ageHours), "hour")
      : plural(Math.round(ageHours / 24), "day");

  return {
    stale: true,
    ageHours,
    reason: crossesMonth
      ? `Rung up ${age} ago, in a different month. Posting it now puts it in this month's GST return, not the one it belongs to.`
      : `Rung up ${age} ago. Stock and prices may have moved since — check the batch before posting it.`,
  };
}
