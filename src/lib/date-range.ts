/**
 * Local calendar date as YYYY-MM-DD.
 *
 * Not `toISOString().slice(0, 10)`: that converts to UTC first. In IST
 * (UTC+5:30) anything between midnight and 05:30 local still reads as
 * *yesterday* in UTC, so a 24×7 pharmacy's night trade fell outside the
 * default range of every report — the rows existed, the filter just never
 * reached them. The window is applied in local time (see `dateWindow`), so
 * the bounds have to be computed in local time too.
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Defaults an optional {from, to} query-param pair to the current calendar month to date. */
export function defaultMonthRange(searchParams: { from?: string; to?: string }) {
  const now = new Date();
  const from =
    searchParams.from ?? toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = searchParams.to ?? toLocalDateString(now);
  return { from, to };
}

/**
 * A YYYY-MM-DD string as local midnight.
 *
 * `new Date("2026-08-01")` is parsed as **UTC** midnight by specification —
 * which in IST is 05:30 on the 1st. Used as the lower bound of a report
 * range, that quietly drops everything transacted in the first five and a
 * half hours of the day, and excludes a cost dated the 1st that was
 * written as local midnight. Both were live bugs.
 *
 * `new Date(y, m, d)` is local by specification, which is what a shop
 * means by "the 1st".
 */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Start and end of a local-time date range, inclusive of both days. */
export function localDateWindow(from: string, to: string): { fromDate: Date; toDate: Date } {
  const fromDate = parseLocalDate(from);
  const toDate = parseLocalDate(to);
  toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
}
