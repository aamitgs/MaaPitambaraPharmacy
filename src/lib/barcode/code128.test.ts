import { describe, it, expect } from "vitest";
import {
  encodeCode128,
  encodeCode128B,
  code128Width,
  CODE128_PATTERNS,
  QUIET_ZONE_MODULES,
  BarcodeError,
} from "./code128";

describe("Code 128 pattern table", () => {
  it("has all 107 symbols", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
  });

  it("gives every symbol exactly 11 modules, and the stop pattern 13", () => {
    // The real point of this test: a single mistyped digit anywhere in the
    // table breaks this invariant, and would otherwise only show up as a
    // label that will not scan.
    CODE128_PATTERNS.slice(0, 106).forEach((p, i) => {
      expect(p, `pattern ${i}`).toHaveLength(6);
      expect(
        p.split("").reduce((a, b) => a + Number(b), 0),
        `pattern ${i} module count`
      ).toBe(11);
    });
    expect(CODE128_PATTERNS[106]).toBe("2331112");
    expect(CODE128_PATTERNS[106].split("").reduce((a, b) => a + Number(b), 0)).toBe(13);
  });

  it("starts every pattern with a bar and ends with a space (stop excepted)", () => {
    // Widths alternate bar/space, so an even count keeps the next symbol
    // starting on a bar. Six is even; the 7-element stop is what returns
    // the terminating bar.
    CODE128_PATTERNS.slice(0, 106).forEach((p) => expect(p.length % 2).toBe(0));
  });
});

describe("encoding", () => {
  it("wraps the data in a start code, a checksum and a stop", () => {
    const widths = encodeCode128B("A");
    // start(6) + A(6) + checksum(6) + stop(7)
    expect(widths).toHaveLength(25);
  });

  it("computes the checksum the way the spec weights it", () => {
    // "A" is value 33. Checksum = (104 + 33*1) mod 103 = 34.
    const widths = encodeCode128B("A");
    const checksumPattern = widths.slice(12, 18).join("");
    expect(checksumPattern).toBe(CODE128_PATTERNS[34]);
  });

  it("encodes a realistic batch label and stays a whole number of modules", () => {
    const widths = encodeCode128B("PCM24A");
    const symbols = 1 + 6 + 1; // start + data + checksum
    expect(widths.reduce((a, b) => a + b, 0)).toBe(symbols * 11 + 13);
  });

  it("refuses characters it cannot represent rather than dropping them", () => {
    // A label that scans as a different code than the one printed on it is
    // the worst possible failure, so this throws instead of sanitising.
    expect(() => encodeCode128B("PCM₹24")).toThrow(BarcodeError);
    expect(() => encodeCode128B("")).toThrow(BarcodeError);
  });
});

describe("subset C for numeric codes", () => {
  it("halves the width of a 13-digit barcode, which is what makes it fit a 50mm label", () => {
    const code = "2685686503618";
    // Subset B: start + 13 data + checksum = 15 symbols.
    expect(encodeCode128B(code).reduce((a, b) => a + b, 0)).toBe(15 * 11 + 13);
    // Subset C: start + 6 pairs + switch + 1 digit + checksum = 10 symbols.
    expect(encodeCode128(code).reduce((a, b) => a + b, 0)).toBe(10 * 11 + 13);
  });

  it("keeps an even-length numeric code entirely in subset C", () => {
    // start + 6 pairs + checksum = 8 symbols, no switch needed.
    expect(encodeCode128("890123456789").reduce((a, b) => a + b, 0)).toBe(8 * 11 + 13);
  });

  it("falls back to subset B the moment a letter appears", () => {
    expect(encodeCode128("PCM24A")).toEqual(encodeCode128B("PCM24A"));
  });

  it("weights the checksum across a mid-symbol subset switch", () => {
    // "123" -> start C(105), pair 12, switch to B(100), '3'(19), checksum.
    // (105 + 12*1 + 100*2 + 19*3) mod 103 = (105+12+200+57) mod 103 = 374 mod 103 = 65.
    const widths = encodeCode128("123");
    const checksumPattern = widths.slice(4 * 6, 4 * 6 + 6).join("");
    expect(checksumPattern).toBe(CODE128_PATTERNS[65]);
  });

  it("measures the printed width including quiet zones", () => {
    expect(code128Width("2685686503618")).toBe(10 * 11 + 13 + QUIET_ZONE_MODULES * 2);
  });
});
