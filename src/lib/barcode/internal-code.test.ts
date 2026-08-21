import { describe, it, expect } from "vitest";
import {
  ean13CheckDigit,
  isValidEan13,
  buildInternalBarcode,
  isInternalBarcode,
} from "./internal-code";

describe("EAN-13 check digit", () => {
  it("matches known real barcodes", () => {
    // Two published EAN-13 codes; the last digit is the check digit.
    // The second is the ISBN-13 of a real book, which is a valid EAN-13.
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("978030640615")).toBe(7);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("9780306406157")).toBe(true);
  });

  it("rejects a code with a transposed pair", () => {
    // The weighting is what catches transpositions — the commonest
    // keying error when someone types a barcode in by hand.
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381339331")).toBe(false);
  });

  it("refuses to compute on the wrong length", () => {
    expect(() => ean13CheckDigit("12345")).toThrow();
  });
});

describe("internal barcodes", () => {
  it("always lands in the GS1 in-store range and checks out", () => {
    // Deterministic sequence so a failure is reproducible.
    let n = 0;
    const rand = () => ((n = (n * 1103515245 + 12345) % 2147483648), n / 2147483648);
    for (let i = 0; i < 500; i++) {
      const code = buildInternalBarcode(rand);
      expect(code).toHaveLength(13);
      expect(code[0]).toBe("2");
      expect(isValidEan13(code)).toBe(true);
      expect(isInternalBarcode(code)).toBe(true);
    }
  });

  it("does not mistake a manufacturer's barcode for one of ours", () => {
    expect(isInternalBarcode("4006381333931")).toBe(false);
    expect(isInternalBarcode("8901234567890")).toBe(false);
  });
});
