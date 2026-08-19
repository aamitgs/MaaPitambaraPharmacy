import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/**
 * Installable-app metadata. Worth having beyond cosmetics: the POS screen
 * is offline-capable, so counter staff commonly keep it installed/pinned
 * rather than as one tab among many.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/pos",
    display: "standalone",
    background_color: BRAND.backgroundColor,
    theme_color: BRAND.themeColor,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
