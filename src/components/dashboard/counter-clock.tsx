"use client";

import { useSyncExternalStore } from "react";
import { format } from "date-fns";

/**
 * Analog face in the brand's maroon and gold, with the digital time under
 * it. Same external-store tick as the header clock: the server and the till
 * are never on the same second, so rendering a time on the server would
 * guarantee a hydration mismatch.
 */
let tick = Date.now();

function subscribe(onStoreChange: () => void) {
  tick = Date.now();
  const id = setInterval(() => {
    tick = Date.now();
    onStoreChange();
  }, 1000);
  return () => clearInterval(id);
}

const getSnapshot = () => tick;
const getServerSnapshot = () => null;

export function CounterClock({ location }: { location: string }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (now === null) {
    // Reserve the space so the panel doesn't jump when the clock arrives.
    return <div className="h-[248px]" aria-hidden />;
  }

  const date = new Date(now);
  const seconds = date.getSeconds();
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="h-40 w-40" role="img" aria-hidden>
        <circle cx="100" cy="100" r="96" className="fill-brand-maroon" />
        <circle cx="100" cy="100" r="88" fill="none" className="stroke-brand-gold/30" strokeWidth="1" />
        {Array.from({ length: 60 }).map((_, i) => {
          const major = i % 5 === 0;
          return (
            <line
              key={i}
              x1="100"
              y1={major ? 14 : 18}
              x2="100"
              y2={major ? 26 : 22}
              className={major ? "stroke-brand-cream" : "stroke-brand-cream/40"}
              strokeWidth={major ? 3 : 1.5}
              strokeLinecap="round"
              transform={`rotate(${i * 6} 100 100)`}
            />
          );
        })}
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n, i) => {
          const angle = ((i * 30 - 90) * Math.PI) / 180;
          return (
            <text
              key={n}
              x={100 + Math.cos(angle) * 66}
              y={100 + Math.sin(angle) * 66}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-brand-cream text-[15px] font-semibold"
            >
              {n}
            </text>
          );
        })}
        {/* Hour and minute in cream, second hand in gold — the one moving
            part gets the accent so the face reads as alive at a glance. */}
        <line
          x1="100" y1="100" x2="100" y2="52"
          className="stroke-brand-cream" strokeWidth="6" strokeLinecap="round"
          transform={`rotate(${hours * 30} 100 100)`}
        />
        <line
          x1="100" y1="100" x2="100" y2="34"
          className="stroke-brand-cream" strokeWidth="4" strokeLinecap="round"
          transform={`rotate(${minutes * 6} 100 100)`}
        />
        <line
          x1="100" y1="112" x2="100" y2="30"
          className="stroke-brand-gold" strokeWidth="1.5" strokeLinecap="round"
          transform={`rotate(${seconds * 6} 100 100)`}
        />
        <circle cx="100" cy="100" r="6" className="fill-brand-gold" />
      </svg>

      <div className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
        {format(date, "h:mm")}
        <span className="ml-1 text-2xl font-medium text-muted-foreground">
          {format(date, "a").toLowerCase()}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">Current time at {location}</p>
    </div>
  );
}
