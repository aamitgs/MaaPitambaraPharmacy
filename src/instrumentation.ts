/**
 * Runs once per server instance, before the first request is served.
 *
 * The only thing here is the clock, and it matters more than it looks.
 * Every date in this app is computed with local-time methods — see
 * `date-range.ts`, which deliberately avoids `toISOString()` — because a
 * pharmacy's day, its GST period and its invoice numbering are local
 * calendar facts, not UTC ones. That is correct on the shop's own machine,
 * whose clock is IST, and silently wrong on a cloud host, whose clock is
 * UTC: a bill rung up at 02:00 IST on the 1st is then dated the previous
 * day and numbered into the previous month. That is a filed-return error,
 * not a display bug, and nothing about it looks broken at the counter.
 *
 * Pinning the zone here rather than trusting the host's environment means
 * the app cannot be deployed into the wrong timezone by omission — the
 * failure would otherwise be invisible until a return was filed.
 */
export function register() {
  // process.env.TZ only means anything to the Node runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const zone = process.env.PHARMACY_TIMEZONE || "Asia/Kolkata";
  process.env.TZ = zone;

  // Two ways this silently fails, both worth catching here rather than in a
  // quarter's GST return:
  //   - an unknown zone name, which Node accepts and then ignores;
  //   - the assignment not taking effect at all on some host.
  // Comparing zone *names* does not work — ICU canonicalises "Asia/Kolkata"
  // to the legacy alias "Asia/Calcutta" — so compare the wall clock the zone
  // produces against the one the runtime is actually using.
  const shape: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const probe = new Date("2026-01-01T00:00:00Z");

  let wanted: string;
  try {
    wanted = new Intl.DateTimeFormat("en-CA", { ...shape, timeZone: zone }).format(probe);
  } catch {
    console.error(
      `[startup] "${zone}" is not a recognised timezone. Invoice dates, GST ` +
        `periods and document numbering will use the host clock and may be ` +
        `wrong. Check PHARMACY_TIMEZONE.`
    );
    return;
  }

  const actual = new Intl.DateTimeFormat("en-CA", shape).format(probe);
  if (wanted !== actual) {
    console.error(
      `[startup] Timezone "${zone}" did not take effect — the runtime clock ` +
        `reads ${actual} where ${zone} reads ${wanted}. Invoice dates, GST ` +
        `periods and document numbering will be wrong.`
    );
  }
}
