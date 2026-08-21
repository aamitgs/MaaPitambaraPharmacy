import type { MetadataRoute } from "next";
import { getBranding } from "@/lib/branding";

/**
 * Installable-app metadata. Worth having beyond cosmetics: the POS screen
 * is offline-capable, so counter staff commonly keep it installed/pinned
 * rather than as one tab among many.
 *
 * Async so a rebrand reaches the home-screen icon and label. Note the
 * install is only re-read when the browser next fetches the manifest —
 * an already-installed shortcut keeps its old icon until then.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBranding();

  // The bundled 192/512 PNGs are pre-sized for install prompts. An uploaded
  // logo has no such guarantee, so it is offered at both sizes and left to
  // the browser to scale — better than showing the old pharmacy's roundel.
  const icons = branding.hasCustomLogo
    ? [
        { src: branding.logo.icon, sizes: "192x192", type: "image/png", purpose: "any" as const },
        { src: branding.logo.icon, sizes: "512x512", type: "image/png", purpose: "any" as const },
      ]
    : [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" as const },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" as const },
      ];

  return {
    name: branding.name,
    short_name: branding.shortName,
    description: branding.description,
    start_url: "/pos",
    display: "standalone",
    background_color: branding.colors.surface,
    theme_color: branding.colors.primary,
    icons,
  };
}
