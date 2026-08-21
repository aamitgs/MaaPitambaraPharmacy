/**
 * Finding the real header row in an exported report.
 *
 * Pharmacy software exports reports, not data files. A Marg stock report
 * opens with the shop's name and address merged across every column, then
 * "STOCK REPORT AS ON DATE …" the same way, and only then the actual
 * column names — sometimes over two rows, where the second names sub-columns
 * under the first.
 *
 * Taking the first non-empty row as the header turns all of that into
 * fifteen columns called "MAA PITAMBARA PHARMACY …", and every field maps
 * to nothing.
 */

export type HeaderDetection = {
  headerIndex: number;
  /** First row of real data — past any sub-header lines. */
  dataStartIndex: number;
  headers: string[];
};

const clean = (v: string | undefined) => (v ?? "").trim();

/**
 * A merged title repeats the same text across the columns it spans, so a
 * row whose filled cells are mostly the same value is a banner, not a
 * header. Real headers name different things.
 */
function looksLikeHeader(row: string[]): boolean {
  const filled = row.map(clean).filter(Boolean);
  if (filled.length < 2) return false;
  const distinct = new Set(filled.map((v) => v.toLowerCase())).size;
  if (distinct < 2) return false;
  // Two-thirds distinct tolerates a header that legitimately repeats a
  // word ("Sales Scheme" over two sub-columns) without accepting a banner.
  return distinct / filled.length >= 0.6;
}

/**
 * Whether `row` is another line of the same header rather than data —
 * a sub-header under a spanned column, or the header repeated.
 */
function isRepeatedHeader(row: string[], header: string[]): boolean {
  const cells = row.map(clean);
  const filled = cells.filter(Boolean);
  if (filled.length === 0) return false;

  // Marg repeats the stable columns and only changes the spanned ones, so
  // the first column matching is a strong signal.
  if (clean(header[0]) && cells[0].toLowerCase() === clean(header[0]).toLowerCase()) return true;

  const shared = cells.filter(
    (c, i) => c && clean(header[i]) && c.toLowerCase() === clean(header[i]).toLowerCase()
  ).length;
  return shared / filled.length >= 0.6;
}

/**
 * Column names must be unique — they become object keys, and a repeated
 * name silently drops every column after the first.
 */
function makeUnique(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const name = clean(h);
    if (!name) return "";
    const count = seen.get(name.toLowerCase()) ?? 0;
    seen.set(name.toLowerCase(), count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

export function detectHeader(matrix: string[][], searchLimit = 25): HeaderDetection {
  let headerIndex = -1;
  for (let i = 0; i < Math.min(matrix.length, searchLimit); i++) {
    if (looksLikeHeader(matrix[i] ?? [])) {
      headerIndex = i;
      break;
    }
  }
  // Nothing looked like a header — fall back to the first row so the
  // caller still gets something to map rather than an exception.
  if (headerIndex === -1) headerIndex = 0;

  const raw = matrix[headerIndex] ?? [];
  let dataStartIndex = headerIndex + 1;
  while (
    dataStartIndex < matrix.length &&
    isRepeatedHeader(matrix[dataStartIndex] ?? [], raw)
  ) {
    dataStartIndex++;
  }

  const headers = makeUnique(raw);
  // Trailing empty columns become phantom fields in the mapping dropdown.
  while (headers.length && !headers[headers.length - 1]) headers.pop();

  return { headerIndex, dataStartIndex, headers };
}

/** Builds row objects from a matrix, given a detected header. */
export function rowsFromMatrix(matrix: string[][], detection: HeaderDetection) {
  const { headers, dataStartIndex } = detection;
  const rows: Record<string, string>[] = [];
  for (let i = dataStartIndex; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    const obj: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const text = clean(cells[col]);
      obj[h] = text;
      if (text !== "") hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}
