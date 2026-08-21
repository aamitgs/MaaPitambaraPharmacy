/**
 * Code 128 (subset B) encoder.
 *
 * Written out rather than pulled in as a dependency because the whole
 * symbology is one lookup table and forty lines of arithmetic, and a label
 * that scans wrong is worse than one that does not print. The table below
 * is checked for internal consistency by the accompanying test: every
 * pattern must be exactly 11 modules wide, which catches a mistyped digit
 * far more reliably than reading it back.
 *
 * Subset B covers all of printable ASCII, which is what item barcodes and
 * batch numbers actually contain. Subset C would pack pairs of digits more
 * tightly, but the width saved is not worth a second code path.
 */

// Alternating bar/space widths in modules, indexed by Code 128 value.
// Index 103–105 are the start codes, 106 is stop.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100; // switch to subset B mid-symbol
const STOP = 106;

/// Modules of blank space either side of the symbol. Ten is the Code 128
/// minimum; without it a scanner has nothing to calibrate against and the
/// first bar reads as part of the label's border.
export const QUIET_ZONE_MODULES = 10;

export class BarcodeError extends Error {}

function subsetBValues(text: string): number[] {
  return [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    // Subset B runs from space (32) to DEL-1 (126). Anything outside it —
    // a rupee sign pasted into a batch number, a non-breaking space — has
    // no representation, and silently dropping it would print a label that
    // scans as a different code than the one on screen.
    if (code < 32 || code > 126) {
      throw new BarcodeError(
        `"${ch}" cannot be printed as a barcode. Use letters, digits and basic punctuation only.`
      );
    }
    return code - 32;
  });
}

/**
 * Chooses the symbols for `text`, using subset C wherever the data is
 * numeric.
 *
 * This is not an optimisation for its own sake. Subset C carries two digits
 * per symbol, so a 13-digit barcode is 123 modules instead of 198 — the
 * difference between a symbol that fits a 50mm label at full nominal bar
 * width and one that has to be squeezed until it stops scanning.
 */
function chooseSymbols(text: string): number[] {
  const allDigits = /^\d+$/.test(text);
  if (!allDigits) return [START_B, ...subsetBValues(text)];

  // An odd-length run leaves one digit over; it is cheaper to carry that
  // last digit in subset B than to drop out of C for the whole string.
  const pairCount = Math.floor(text.length / 2);
  const symbols: number[] = [START_C];
  for (let i = 0; i < pairCount; i++) symbols.push(Number(text.slice(i * 2, i * 2 + 2)));
  if (text.length % 2 === 1) {
    symbols.push(CODE_B, text.charCodeAt(text.length - 1) - 32);
  }
  return symbols;
}

/**
 * Returns the symbol as alternating widths in modules, starting with a bar.
 * Rendering is left to the caller — SVG on screen, anything else in print.
 */
export function encodeCode128(text: string): number[] {
  if (!text) throw new BarcodeError("Nothing to encode.");

  const symbols = chooseSymbols(text);

  // Checksum is position-weighted from 1; the start code itself weighs 1,
  // and every symbol after it takes its ordinal position — mid-string
  // subset switches included.
  let checksum = symbols[0];
  symbols.slice(1).forEach((v, i) => {
    checksum += v * (i + 1);
  });
  checksum %= 103;

  return [...symbols, checksum, STOP].flatMap((s) => PATTERNS[s].split("").map(Number));
}

/** Kept for callers that specifically want subset B, and for the tests. */
export function encodeCode128B(text: string): number[] {
  if (!text) throw new BarcodeError("Nothing to encode.");
  const symbols = [START_B, ...subsetBValues(text)];
  let checksum = START_B;
  symbols.slice(1).forEach((v, i) => {
    checksum += v * (i + 1);
  });
  checksum %= 103;
  return [...symbols, checksum, STOP].flatMap((s) => PATTERNS[s].split("").map(Number));
}

/** Total width in modules, quiet zones included, for laying out a label. */
export function code128Width(text: string): number {
  return encodeCode128(text).reduce((a, b) => a + b, 0) + QUIET_ZONE_MODULES * 2;
}

/** The raw pattern table, exported only so the test can audit it. */
export const CODE128_PATTERNS = PATTERNS;

/**
 * The smallest bar width GS1 allows for Code 128 at reduced magnification.
 * Below this, cheap counter scanners start misreading — so a symbol that
 * will not fit a label at this width is reported as not fitting rather
 * than quietly shrunk further.
 */
export const MIN_MODULE_MM = 0.19;
/// GS1 nominal X-dimension for retail. What we use whenever there is room.
export const NOMINAL_MODULE_MM = 0.33;

/**
 * Picks the widest bar width that fits `maxWidthMm`, never going below the
 * scannable minimum. `fits: false` means the code is too long for the
 * label — the caller should say so rather than print something unreadable.
 */
export function fitModuleWidth(
  text: string,
  maxWidthMm: number
): { moduleWidthMm: number; widthMm: number; fits: boolean } {
  const modules = code128Width(text);
  const ideal = maxWidthMm / modules;
  const moduleWidthMm = Math.min(NOMINAL_MODULE_MM, Math.max(MIN_MODULE_MM, ideal));
  return {
    moduleWidthMm,
    widthMm: modules * moduleWidthMm,
    fits: modules * moduleWidthMm <= maxWidthMm + 0.01,
  };
}
