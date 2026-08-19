"use client";

import { useSyncExternalStore } from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";

/**
 * Live wall clock for the app header. Counter staff date-stamp bills,
 * expiry checks and register entries by it, so it ticks every second
 * rather than rendering once.
 *
 * Modelled as an external store rather than `useState` + `useEffect`:
 * `getSnapshot` has to return a stable value between ticks (returning
 * `Date.now()` directly would re-render forever), and the null server
 * snapshot is what keeps hydration clean — the server and the till are
 * never on the same second, and may not even be in the same timezone.
 */
let tick = Date.now();

function subscribe(onStoreChange: () => void) {
  // Refresh on subscribe: the module may have been evaluated long before
  // this component mounted.
  tick = Date.now();
  const id = setInterval(() => {
    tick = Date.now();
    onStoreChange();
  }, 1000);
  return () => clearInterval(id);
}

const getSnapshot = () => tick;
const getServerSnapshot = () => null;

export function CurrentTime() {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (now === null) {
    // Hold the row height so the header doesn't shift on hydration.
    return <div className="h-5" aria-hidden />;
  }

  const date = new Date(now);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{format(date, "EEE, dd MMM yyyy")}</span>
      <span className="font-mono tabular-nums text-foreground">
        {format(date, "hh:mm:ss a")}
      </span>
    </div>
  );
}
