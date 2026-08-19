/** Defaults an optional {from, to} query-param pair to the current calendar month to date. */
export function defaultMonthRange(searchParams: { from?: string; to?: string }) {
  const now = new Date();
  const from = searchParams.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = searchParams.to ?? now.toISOString().slice(0, 10);
  return { from, to };
}
