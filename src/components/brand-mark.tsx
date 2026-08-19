import Image from "next/image";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * The supplied Maa Pitambara Pharmacy artwork, served from `public/`.
 * Each file is the original trimmed to its content — the supplied PNGs
 * carry transparent margin (345px under the stacked wordmark, 392px beside
 * the horizontal one), which would otherwise show up as unexplained gaps
 * that CSS can't close:
 *   logo-icon.png        the roundel on its own  (also src/app/icon.png,
 *                        public/icon-192.png and icon-512.png, resized for
 *                        the favicon and the PWA manifest)
 *   logo-stacked.png     roundel above the wordmark — the login screen
 *   logo-horizontal.png  roundel beside the wordmark — spare, for wide headers
 *
 * Both components take `alt=""` by default: each is rendered next to text
 * that already names the pharmacy (the sidebar heading, the login card's
 * title), so announcing the logo again would just repeat it.
 */
export function BrandMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <Image
      src="/logo-icon.png"
      alt={alt}
      width={256}
      height={256}
      priority
      className={cn("h-6 w-6 shrink-0 object-contain", className)}
    />
  );
}

/**
 * Horizontal lockup — roundel beside the wordmark. The app-chrome logo:
 * it carries the name itself, so wherever this is used there is no separate
 * pharmacy-name text next to it.
 */
export function BrandLockupHorizontal({
  className,
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/logo-horizontal.png"
      alt={alt}
      width={1348}
      height={440}
      priority
      className={cn("h-9 w-auto object-contain", className)}
    />
  );
}

/** Stacked lockup — roundel above the wordmark — as used on the login screen. */
export function BrandLockup({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <Image
      src="/logo-stacked.png"
      alt={alt}
      width={946}
      height={1129}
      priority
      className={cn("h-auto w-44 object-contain", className)}
    />
  );
}
