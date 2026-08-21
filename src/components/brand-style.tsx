import { getBranding } from "@/lib/branding";
import { deriveBrandScale } from "@/lib/color";
import { BRAND } from "@/lib/brand";
import { BRAND_ACCENT } from "@/lib/branding";

/**
 * Emits the owner's palette as CSS custom properties, overriding the
 * defaults globals.css declares.
 *
 * This is why the whole theme is white-labellable for almost nothing: every
 * `bg-brand-maroon` / `text-brand-gold` class already in the codebase
 * resolves `var(--brand-maroon)` at paint time, so redefining the variable
 * repaints all of them with no Tailwind rebuild and no change at any call
 * site.
 *
 * Rendered in the <body> rather than the <head>: a style element anywhere
 * in the document still applies, and `:root` / `.dark` here match the
 * specificity of the same selectors in globals.css, so the later position
 * in the document is what wins the cascade — which is exactly the intent.
 *
 * Selectors mirror globals.css exactly: this app's dark mode is
 * class-driven (`@custom-variant dark (&:is(.dark *))`), with no
 * `prefers-color-scheme` query and no `data-theme` attribute anywhere.
 * Emitting a media query here would repaint the brand dark whenever the OS
 * was dark, even with the app itself in light mode.
 */
export async function BrandStyle() {
  const branding = await getBranding();

  // Nothing to override while the owner is still on the bundled palette.
  const isDefault =
    branding.colors.primary === BRAND.themeColor &&
    branding.colors.accent === BRAND_ACCENT &&
    branding.colors.surface === BRAND.backgroundColor;
  if (isDefault) return null;

  const scale = deriveBrandScale(
    branding.colors.primary,
    branding.colors.accent,
    branding.colors.surface
  );
  if (!scale) return null;

  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `${k}:${v};`)
      .join("");

  return (
    <style
      // Values are OKLCH strings this process generated from validated hex
      // input — no user text reaches the stylesheet.
      dangerouslySetInnerHTML={{
        __html: `:root{${block(scale.light)}}.dark{${block(scale.dark)}}`,
      }}
    />
  );
}
