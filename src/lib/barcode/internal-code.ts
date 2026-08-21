/**
 * Barcodes the pharmacy issues itself, for loose and repacked goods that
 * arrive with none.
 *
 * These use GS1's restricted-distribution range — a leading 2 — which is
 * reserved worldwide for exactly this: codes that mean something inside one
 * shop and are never used outside it. Picking numbers from that range is
 * what guarantees a repacked strip can never collide with a manufacturer's
 * printed barcode, now or after a future stock import.
 *
 * The result is a valid EAN-13 number. It is printed as Code 128 (which
 * carries the digits identically and needs no fixed width), but keeping it
 * EAN-13-valid means it can be reprinted as a true EAN-13 symbol later
 * without reissuing every label on the shelf.
 */

/** The GS1 prefix reserved for in-store, restricted-circulation numbers. */
export const INTERNAL_PREFIX = "2";

/**
 * Standard EAN-13 modulo-10 check digit: odd positions weight 1, even
 * positions weight 3, counting from the left of the 12 data digits.
 */
export function ean13CheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error("An EAN-13 check digit needs exactly 12 digits.");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(twelveDigits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * Builds one candidate internal barcode. Randomised rather than sequential
 * so that two branches generating codes while offline from each other do
 * not both mint the same "next" number; the caller checks uniqueness and
 * asks again on the (vanishingly rare) clash.
 */
export function buildInternalBarcode(rand: () => number = Math.random): string {
  let body = "";
  for (let i = 0; i < 11; i++) body += Math.floor(rand() * 10);
  const twelve = INTERNAL_PREFIX + body;
  return twelve + ean13CheckDigit(twelve);
}

/** Whether a barcode is one this pharmacy issued rather than a printed one. */
export function isInternalBarcode(code: string): boolean {
  return /^2\d{12}$/.test(code) && isValidEan13(code);
}
