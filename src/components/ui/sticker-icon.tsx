import { useId, type ComponentType } from "react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string; strokeWidth?: number }>;

// Decorative accent gradients for the star/blob only — never used for text or
// surfaces. Gold and maroon reuse the brand pair; teal/sky/terracotta extend
// it the way chart-5 already does, so nav items read as distinct at a glance
// instead of 46 identical gold stickers.
const ACCENTS = [
  { from: "var(--brand-gold-light)", to: "var(--brand-gold)" },
  { from: "var(--brand-maroon-light)", to: "var(--brand-maroon)" },
  { from: "var(--sticker-teal-light)", to: "var(--sticker-teal)" },
  { from: "var(--sticker-sky-light)", to: "var(--sticker-sky)" },
  { from: "var(--sticker-terracotta-light)", to: "var(--sticker-terracotta)" },
];

function accentFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

/**
 * Wraps any lucide icon in a hand-drawn "sticker" treatment — a tilted card,
 * a bold-stroke glyph, and a star + blob accent — so the whole nav can carry
 * one illustrated look without hand-drawing 46 unique icons. The accent color
 * is keyed off `seed` (pass the item's name) so neighboring items don't all
 * wear the same color.
 */
export function StickerIcon({
  icon: Icon,
  seed,
  active = false,
  className,
}: {
  icon: IconComponent;
  seed: string;
  active?: boolean;
  className?: string;
}) {
  const gradientId = `sticker-accent-${useId()}`;
  const accent = accentFor(seed);

  return (
    <span className={cn("relative inline-block shrink-0", className)}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent.from} />
            <stop offset="100%" stopColor={accent.to} />
          </linearGradient>
        </defs>
        {/* Scales as one image on hover/focus — a parent CSS transform composes
            cleanly with each child's own SVG `transform` attribute, so the
            card's tilt and the accents' rotation don't fight this. */}
        <g
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          className="scale-100 transition-transform duration-300 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none"
        >
          <rect
            x="5"
            y="6"
            width="28"
            height="28"
            rx="9"
            transform="rotate(-8 19 20)"
            className={active ? "fill-brand-gold-tint" : "fill-muted"}
          />
          <g opacity="0.95">
            <ellipse
              cx="7"
              cy="31"
              rx="2.6"
              ry="4.4"
              transform="rotate(20 7 31)"
              fill={`url(#${gradientId})`}
            />
            <ellipse
              cx="10.6"
              cy="32.6"
              rx="2.3"
              ry="4"
              transform="rotate(20 10.6 32.6)"
              fill={`url(#${gradientId})`}
            />
            <ellipse
              cx="13.8"
              cy="33.6"
              rx="2"
              ry="3.6"
              transform="rotate(20 13.8 33.6)"
              fill={`url(#${gradientId})`}
            />
          </g>
          {/* The star gets its own slightly longer, delayed spin so it reads
              as a little twinkle rather than moving in lockstep with the card. */}
          <path
            d="M32 3 L33.4 7.2 L37.6 8.6 L33.4 10 L32 14.2 L30.6 10 L26.4 8.6 L30.6 7.2 Z"
            fill={`url(#${gradientId})`}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            className="rotate-0 transition-transform duration-500 ease-out group-hover:rotate-45 group-focus-visible:rotate-45 motion-reduce:transition-none"
          />
        </g>
      </svg>
      <Icon
        className="absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 text-foreground transition-transform duration-300 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none"
        strokeWidth={2.5}
      />
    </span>
  );
}
