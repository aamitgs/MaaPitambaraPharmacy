/**
 * sRGB hex <-> OKLCH, and the derived steps the brand palette needs.
 *
 * The app's theme is defined in OKLCH (see globals.css) because lightness
 * is perceptually uniform there: a tint derived by raising L by a fixed
 * amount looks like the same step whatever the hue, which is not true in
 * HSL. An owner picking colours only ever types hex, so this is the layer
 * between the two.
 */

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export type Oklch = { l: number; c: number; h: number };

export function hexToOklch(hex: string): Oklch | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = srgbToLinear(((int >> 16) & 255) / 255);
  const g = srgbToLinear(((int >> 8) & 255) / 255);
  const b = srgbToLinear((int & 255) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m2 = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m2 - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m2 + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m2 - 0.808675766 * s;

  const chroma = Math.sqrt(A * A + B * B);
  let hue = (Math.atan2(B, A) * 180) / Math.PI;
  if (hue < 0) hue += 360;

  return { l: L, c: chroma, h: hue };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);

  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;

  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  const to255 = (v: number) =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/** `oklch(L C H)` as CSS, at the precision globals.css uses. */
export function oklchCss({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/**
 * WCAG relative luminance, for the contrast check the branding form runs
 * before letting a colour through. Computed from hex rather than OKLCH
 * lightness: they correlate but WCAG is the standard that actually governs
 * whether text is legible, and it is what an auditor would measure.
 */
export function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) =>
    srgbToLinear(v / 255)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const isHex = (v: string) => /^#?[0-9a-f]{6}$/i.test(v.trim());

export const normalizeHex = (v: string) =>
  `#${v.trim().replace(/^#/, "").toLowerCase()}`;

/**
 * The six --brand-* variables globals.css declares, derived from the two
 * colours an owner actually picks. The light/tint steps are lightness and
 * chroma shifts off the same hue, which is why this works in OKLCH and
 * would band badly in HSL.
 */
export function deriveBrandScale(primaryHex: string, accentHex: string, surfaceHex: string) {
  const primary = hexToOklch(primaryHex);
  const accent = hexToOklch(accentHex);
  const surface = hexToOklch(surfaceHex);
  if (!primary || !accent || !surface) return null;

  return {
    light: {
      "--brand-maroon": oklchCss(primary),
      "--brand-maroon-light": oklchCss({ ...primary, l: Math.min(primary.l + 0.064, 0.95) }),
      "--brand-gold": oklchCss(accent),
      "--brand-gold-light": oklchCss({ ...accent, l: Math.min(accent.l + 0.113, 0.96) }),
      "--brand-gold-tint": oklchCss({ ...accent, l: 0.945, c: Math.min(accent.c, 0.051) }),
      "--brand-cream": oklchCss(surface),
    },
    /**
     * Dark mode is derived, not flipped: on a dark ground the brand hue has
     * to come up in lightness to stay visible at all, and drop a little
     * chroma so it doesn't glare. The tint and cream steps inverse entirely
     * — they are surfaces there, not accents.
     */
    dark: {
      "--brand-maroon": oklchCss({ ...primary, l: 0.62, c: Math.min(primary.c + 0.041, 0.2) }),
      "--brand-maroon-light": oklchCss({ ...primary, l: 0.7, c: Math.min(primary.c + 0.021, 0.18) }),
      "--brand-gold": oklchCss({ ...accent, l: 0.82, c: Math.min(accent.c + 0.007, 0.16) }),
      "--brand-gold-light": oklchCss({ ...accent, l: 0.88, c: Math.min(accent.c - 0.03, 0.13) }),
      "--brand-gold-tint": oklchCss({ ...accent, l: 0.32, c: 0.03 }),
      "--brand-cream": oklchCss({ ...surface, l: 0.3, c: 0.02 }),
    },
  };
}
