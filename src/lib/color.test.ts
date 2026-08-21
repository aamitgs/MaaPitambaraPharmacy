import { describe, it, expect } from "vitest";
import {
  hexToOklch,
  oklchToHex,
  oklchCss,
  contrastRatio,
  deriveBrandScale,
  isHex,
  normalizeHex,
} from "./color";

describe("colour conversion", () => {
  it("round-trips hex through OKLCH without drift", () => {
    for (const hex of ["#6e1b3a", "#c9922f", "#fff8ef", "#0f766e", "#000000", "#ffffff"]) {
      expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
    }
  });

  it("reproduces the values globals.css declares", () => {
    // These are the literals in src/app/globals.css. If the conversion ever
    // drifts, an owner "resetting to the shipped palette" would quietly get
    // a slightly different brand than the stylesheet ships.
    expect(oklchCss(hexToOklch("#6E1B3A")!)).toBe("oklch(0.369 0.119 2.4)");
    expect(oklchCss(hexToOklch("#FFF8EF")!)).toBe("oklch(0.982 0.014 74.4)");
  });

  it("rejects anything that is not a 6-digit hex", () => {
    expect(hexToOklch("nope")).toBeNull();
    expect(hexToOklch("#fff")).toBeNull();
    expect(isHex("#abc123")).toBe(true);
    expect(isHex("abc123")).toBe(true);
    expect(isHex("#gg1234")).toBe(false);
    expect(normalizeHex("ABC123")).toBe("#abc123");
  });

  it("computes WCAG contrast the way an auditor would", () => {
    // Black on white is the definitional 21:1.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 3);
    // Order must not matter.
    expect(contrastRatio("#6e1b3a", "#fff8ef")).toBeCloseTo(
      contrastRatio("#fff8ef", "#6e1b3a")!,
      6
    );
  });

  it("confirms the shipped brand passes the gates the branding form enforces", () => {
    // Primary carries body text on the bill: WCAG AA, 4.5:1.
    expect(contrastRatio("#6E1B3A", "#FFF8EF")!).toBeGreaterThanOrEqual(4.5);
    // Accent carries the large counter-hours figure on maroon: 3:1.
    expect(contrastRatio("#c9922f", "#6E1B3A")!).toBeGreaterThanOrEqual(3);
  });

  it("derives a full light and dark scale from three colours", () => {
    const scale = deriveBrandScale("#6E1B3A", "#c9922f", "#FFF8EF")!;
    const keys = [
      "--brand-maroon",
      "--brand-maroon-light",
      "--brand-gold",
      "--brand-gold-light",
      "--brand-gold-tint",
      "--brand-cream",
    ];
    for (const k of keys) {
      expect(scale.light[k as keyof typeof scale.light], `light ${k}`).toMatch(/^oklch\(/);
      expect(scale.dark[k as keyof typeof scale.dark], `dark ${k}`).toMatch(/^oklch\(/);
    }
    // Dark mode must lift the brand off a dark ground, not merely reuse it.
    expect(scale.dark["--brand-maroon"]).not.toBe(scale.light["--brand-maroon"]);
  });

  it("returns null rather than a broken scale on bad input", () => {
    expect(deriveBrandScale("nope", "#c9922f", "#FFF8EF")).toBeNull();
  });
});
