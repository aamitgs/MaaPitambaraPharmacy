import { cn } from "@/lib/utils";

/**
 * The pharmacy's artwork, in its three lockups:
 *
 *   BrandMark             the roundel on its own — collapsed sidebar
 *   BrandLockupHorizontal roundel beside the wordmark — app chrome, bills
 *   BrandLockup           roundel above the wordmark — the login screen
 *
 * Each takes its `src` as a prop rather than resolving branding itself.
 * That is deliberate: both consumers (the app shell and the login form) are
 * client components, so an async server component could not be rendered
 * inside them. The server resolves the URL once via getBranding() and
 * threads it down, which also means one database read per request instead
 * of one per logo.
 *
 * Plain `<img>` rather than next/image: an uploaded logo is a runtime
 * database value pointing at an API route, so there is no build-time size
 * to optimise against.
 *
 * `alt=""` by default — every lockup renders beside text that already names
 * the pharmacy, so announcing the logo would just repeat it.
 */
export function BrandMark({
  src,
  className,
  alt = "",
}: {
  src: string;
  className?: string;
  alt?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt={alt} className={cn("h-6 w-6 shrink-0 object-contain", className)} />
  );
}

export function BrandLockupHorizontal({
  src,
  className,
  alt = "",
}: {
  src: string;
  className?: string;
  alt?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt={alt} className={cn("h-9 w-auto object-contain", className)} />
  );
}

export function BrandLockup({
  src,
  className,
  alt = "",
}: {
  src: string;
  className?: string;
  alt?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt={alt} className={cn("h-auto w-44 object-contain", className)} />
  );
}
