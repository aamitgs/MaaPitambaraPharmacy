"use client";

import { hexToOklch, oklchCss, isHex } from "@/lib/color";

/**
 * A miniature bill that repaints as the form is typed in.
 *
 * Deliberately styled with inline CSS variables rather than the app's
 * `bg-brand-*` classes: those resolve the *saved* palette, so a preview
 * built from them would show the old colours until save. Scoping the same
 * variable names to this element means the preview and the real thing are
 * driven by identical values.
 */
export function BrandPreview({
  pharmacyName,
  logoHorizontal,
  showLogo,
  primary,
  accent,
  surface,
  headerText,
  footerText,
  termsText,
}: {
  pharmacyName: string;
  logoHorizontal: string;
  showLogo: boolean;
  primary: string;
  accent: string;
  surface: string;
  headerText: string;
  footerText: string;
  termsText: string;
}) {
  const safe = (hex: string, fallback: string) => (isHex(hex) ? hex : fallback);
  const p = safe(primary, "#6e1b3a");
  const a = safe(accent, "#c9922f");
  const s = safe(surface, "#fff8ef");

  const tint = (() => {
    const oklch = hexToOklch(a);
    return oklch ? oklchCss({ ...oklch, l: 0.945, c: Math.min(oklch.c, 0.051) }) : "#f6ecd9";
  })();

  const lines = (text: string) =>
    text
      .split("|")
      .map((l) => l.trim())
      .filter(Boolean);

  return (
    <div className="space-y-2 xl:sticky xl:top-6 xl:self-start">
      <div className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Live preview
      </div>

      <div
        className="overflow-hidden rounded-lg border shadow-sm"
        style={{ background: s }}
      >
        {/* App chrome, in miniature */}
        <div
          className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold"
          style={{ background: p, color: s }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: a }}
          />
          {pharmacyName || "Your pharmacy"}
        </div>

        {/* The bill */}
        <div className="space-y-1.5 bg-white p-3 text-[8px] leading-tight text-black">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {showLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoHorizontal} alt="" className="mb-0.5 h-5 w-auto object-contain" />
              ) : (
                <div className="mb-0.5 text-[10px] font-bold">{pharmacyName}</div>
              )}
              <div className="text-muted-foreground">16, H.I.G. Shaheed Nagar</div>
            </div>
            <div className="shrink-0 text-[7px] font-bold tracking-[0.18em]">GST INVOICE</div>
          </div>

          {headerText && (
            <div className="text-center text-[7px] italic">
              {lines(headerText).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}

          <div className="border-y border-black/50 py-0.5 font-bold" style={{ color: p }}>
            <div className="flex justify-between">
              <span>Product</span>
              <span>Amount</span>
            </div>
          </div>

          {[
            ["Paracetamol 500mg", "45.00"],
            ["Amoxicillin 250mg", "128.50"],
          ].map(([name, amt]) => (
            <div key={name} className="flex justify-between">
              <span>{name}</span>
              <span>{amt}</span>
            </div>
          ))}

          <div
            className="flex justify-between px-1 py-0.5 text-[9px] font-bold"
            style={{ background: tint, color: p }}
          >
            <span>Total</span>
            <span>₹173.50</span>
          </div>

          {footerText && (
            <div className="border-t pt-1 text-center text-[7px]">
              {lines(footerText).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}

          {termsText && (
            <div className="text-[6px] text-black/60">
              <span className="font-semibold">Terms &amp; Conditions: </span>
              {lines(termsText).join(" · ")}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Colours and text update as you type. Save to apply them everywhere.
      </p>
    </div>
  );
}
