import "server-only";

/**
 * Deterministic helpers for turning a scanned distributor invoice into GRN
 * rows. Kept out of the model's hands on purpose: date conventions and item
 * matching are rules, and rules belong in code where they can be read and
 * corrected, not re-derived per photo.
 */

/**
 * Pharma expiry is printed to month precision ("06/27", "JUN 27") and the
 * pack is good to the end of that month, so a bare month/year resolves to
 * its last day. Manufacture dates resolve to the first.
 */
export function normalizeInvoiceDate(
  raw: string | null,
  kind: "expiry" | "mfg"
): string | null {
  if (!raw) return null;
  const text = raw.trim().toUpperCase();

  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(text);
  if (iso) {
    const [, y, m, d] = iso;
    return d ? `${y}-${m}-${d}` : endpoint(Number(y), Number(m), kind);
  }

  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const named = /^([A-Z]{3})[A-Z]*[\s\-/]*(\d{2,4})$/.exec(text);
  if (named) {
    const month = MONTHS.indexOf(named[1]) + 1;
    if (month > 0) return endpoint(fullYear(named[2]), month, kind);
  }

  const numeric = /^(\d{1,2})[\s\-/](\d{2,4})$/.exec(text);
  if (numeric) {
    const month = Number(numeric[1]);
    if (month >= 1 && month <= 12) return endpoint(fullYear(numeric[2]), month, kind);
  }

  // Anything else (a full dd/mm/yyyy, a smudge, free text) is left for the
  // person reviewing the rows rather than guessed at.
  return null;
}

function fullYear(raw: string): number {
  const n = Number(raw);
  return raw.length <= 2 ? 2000 + n : n;
}

function endpoint(year: number, month: number, kind: "expiry" | "mfg"): string | null {
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, "0");
  if (kind === "mfg") return `${year}-${mm}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
}

export type MatchCandidate = { id: string; name: string; genericName: string | null };

/**
 * Scores a printed invoice description against the item master. Distributor
 * invoices abbreviate heavily ("PCM 500 TAB 10'S"), so this is token overlap
 * on normalized words rather than string similarity — and it returns a score
 * so the UI can distinguish a confident match from a coin flip. Anything
 * uncertain is shown to the user to pick, never silently accepted.
 */
export function matchItem(
  description: string,
  items: MatchCandidate[]
): { item: MatchCandidate; score: number } | null {
  const wanted = tokenize(description);
  if (wanted.length === 0) return null;

  let best: { item: MatchCandidate; score: number } | null = null;
  for (const item of items) {
    const haystack = new Set([...tokenize(item.name), ...tokenize(item.genericName ?? "")]);
    if (haystack.size === 0) continue;

    let hits = 0;
    for (const token of wanted) {
      // A prefix hit catches "PARACET" against "PARACETAMOL".
      if ([...haystack].some((h) => h === token || h.startsWith(token) || token.startsWith(h))) {
        hits += 1;
      }
    }
    const score = hits / wanted.length;
    if (!best || score > best.score) best = { item, score };
  }

  // Below half the words in common it is a guess, not a match.
  return best && best.score >= 0.5 ? best : null;
}

function tokenize(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    // Drop pack-size noise ("10S", "1X10") and single characters.
    .filter((t) => t.length > 1 && !/^\d+S$/.test(t) && !/^\d+X\d+$/.test(t));
}
