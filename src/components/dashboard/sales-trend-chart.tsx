"use client";

import { useState } from "react";
import { format } from "date-fns";

/**
 * Seven days of takings as columns. One series, so no legend — the card
 * title says what is plotted — and no value on every bar: only the best day
 * is labelled, with the rest carried by the hover tooltip. Bars are capped
 * at 24px and separated by surface-coloured gaps rather than strokes.
 */
export function SalesTrendChart({
  data,
}: {
  data: { date: string; total: number }[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const max = Math.max(...data.map((d) => d.total), 1);
  const best = data.reduce((b, d, i) => (d.total > data[b].total ? i : b), 0);
  const hasSales = data.some((d) => d.total > 0);

  return (
    <div>
      {/* items-stretch, not items-end: each column must be full height for
          the bar's percentage height to resolve against something. */}
      <div className="flex h-32 items-stretch gap-2">
        {data.map((day, i) => {
          const heightPct = (day.total / max) * 100;
          const isBest = i === best && day.total > 0;
          return (
            <div
              key={day.date}
              className="relative flex h-full flex-1 flex-col items-center justify-end gap-1"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {hovered === i && (
                <div className="absolute bottom-full z-10 mb-1 w-max rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                  <div className="font-medium">₹{day.total.toFixed(2)}</div>
                  <div className="text-muted-foreground">
                    {format(new Date(day.date), "EEE, dd MMM")}
                  </div>
                </div>
              )}
              {isBest && (
                <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                  ₹{Math.round(day.total)}
                </span>
              )}
              {/* Full-height hit target: a near-zero bar is unhoverable otherwise. */}
              <div className="flex h-full w-full items-end justify-center">
                <div
                  className="w-full max-w-6 rounded-t bg-brand-maroon transition-opacity"
                  style={{
                    height: `${Math.max(heightPct, day.total > 0 ? 4 : 1.5)}%`,
                    opacity: hovered === null || hovered === i ? 1 : 0.45,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2 border-t pt-1.5">
        {data.map((day) => (
          <div
            key={day.date}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {format(new Date(day.date), "EEE")}
          </div>
        ))}
      </div>
      {!hasSales && (
        <p className="mt-2 text-xs text-muted-foreground">No sales recorded in the last 7 days.</p>
      )}
    </div>
  );
}
