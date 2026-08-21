import { encodeCode128, QUIET_ZONE_MODULES } from "@/lib/barcode/code128";

/**
 * A Code 128 symbol as inline SVG.
 *
 * Sized in modules, not pixels, so the caller controls physical width and
 * the bars stay whole numbers of modules at any label size — a symbol
 * scaled to a fractional module width develops rounding seams that a
 * scanner reads as the wrong bar widths.
 */
export function BarcodeSvg({
  value,
  heightMm = 12,
  moduleWidthMm = 0.33,
  className,
}: {
  value: string;
  heightMm?: number;
  /// 0.33mm is the GS1 nominal module width (X-dimension) for retail. Going
  /// much below it is what makes labels stop scanning on cheap readers.
  moduleWidthMm?: number;
  className?: string;
}) {
  const widths = encodeCode128(value);
  const totalModules = widths.reduce((a, b) => a + b, 0) + QUIET_ZONE_MODULES * 2;

  const bars: { x: number; w: number }[] = [];
  let x = QUIET_ZONE_MODULES;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w }); // even index = bar, odd = space
    x += w;
  });

  return (
    <svg
      className={className}
      width={`${(totalModules * moduleWidthMm).toFixed(2)}mm`}
      height={`${heightMm}mm`}
      viewBox={`0 0 ${totalModules} 100`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <rect width={totalModules} height={100} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={100} fill="#000" />
      ))}
    </svg>
  );
}
