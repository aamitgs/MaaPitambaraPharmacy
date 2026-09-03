"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { findSubstitutesByName, type SubstituteResult } from "@/lib/actions/substitutes";
import type { PosItem } from "./types";

function matches(item: PosItem, q: string) {
  const needle = q.toLowerCase();
  return (
    item.name.toLowerCase().includes(needle) ||
    (item.genericName?.toLowerCase().includes(needle) ?? false) ||
    (item.manufacturer?.toLowerCase().includes(needle) ?? false) ||
    (item.hsnCode?.toLowerCase().includes(needle) ?? false) ||
    (item.barcode?.toLowerCase().includes(needle) ?? false)
  );
}

/** A scanner emits the whole code at once, so only an exact hit counts. */
function exactBarcodeMatch(items: PosItem[], q: string) {
  const code = q.trim();
  if (code.length < 6) return null;
  return items.find((item) => item.barcode && item.barcode === code) ?? null;
}

export function SearchPanel({
  items,
  onSelect,
  inputRef,
}: {
  items: PosItem[];
  onSelect: (item: PosItem) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [substitutes, setSubstitutes] = useState<SubstituteResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim();
    return items
      .filter((item) => matches(item, q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 12);
  }, [items, query]);

  // Reset the highlighted result whenever the query changes. Adjusting
  // state during render (rather than in an effect) avoids an extra commit.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setHighlighted(0);
    // Suggestions belong to the query that produced them; clearing here
    // (rather than inside the lookup effect) keeps the effect free of
    // synchronous setState, which cascades renders.
    setSubstitutes(null);
  }

  function selectItem(item: PosItem) {
    onSelect(item);
    setQuery("");
    setHighlighted(0);
    setSubstitutes(null);
  }

  /**
   * The picker only lists what is on the shelf, so a medicine that has run
   * out simply produces no results — and the counter has no way to know
   * whether the shop stocks it at all, let alone what could stand in for
   * it. When the list comes up empty, ask the server.
   *
   * Debounced and only for queries long enough to mean something, so it
   * does not fire on every keystroke of a word being typed.
   */
  useEffect(() => {
    const q = query.trim();
    if (results.length > 0 || q.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLookingUp(true);
      try {
        const found = await findSubstitutesByName(q);
        if (!cancelled) setSubstitutes(found);
      } catch {
        // A failed lookup must never break the till; the counter simply
        // sees no suggestion, exactly as before this existed.
        if (!cancelled) setSubstitutes(null);
      } finally {
        if (!cancelled) setLookingUp(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, results.length]);

  // A hardware scanner behaves like a very fast keyboard: it types the code
  // and presses Enter. Adding the item the moment the code matches — rather
  // than waiting for that Enter — means a scan lands in the cart even when
  // the scanner is configured without a suffix, which is a common default
  // and otherwise looks like the scanner "not working".
  const [scannedFor, setScannedFor] = useState("");
  if (query !== scannedFor) {
    const hit = exactBarcodeMatch(items, query);
    if (hit) {
      setScannedFor(query);
      selectItem(hit);
    } else if (scannedFor !== "") {
      setScannedFor("");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[highlighted];
      if (item) selectItem(item);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        autoFocus
        placeholder="Search by item name, generic name, or scan barcode…   (F2)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-11 text-base"
      />
      {results.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md"
        >
          {results.map((item, i) => {
            const totalQty = item.batches.reduce((s, b) => s + b.currentQty, 0);
            const fefo = item.batches[0];
            return (
              <button
                type="button"
                key={item.id}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => selectItem(item)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                  i === highlighted ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{item.name}</span>
                    {item.scheduleClass !== "none" && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {item.scheduleClass}
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.genericName || item.manufacturer || "—"}
                    {fefo && ` · Batch ${fefo.batchNo} · exp ${format(new Date(fefo.expiryDate), "MMM yyyy")}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium tabular-nums">₹{fefo?.saleRate.toFixed(2)}</div>
                  {fefo && fefo.mrp !== fefo.saleRate && (
                    <div className="text-xs text-muted-foreground line-through">
                      ₹{fefo.mrp.toFixed(2)}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">{totalQty} in stock</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {results.length === 0 && query.trim().length >= 3 && (substitutes || lookingUp) && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
          {lookingUp && !substitutes ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Checking for the same composition…
            </div>
          ) : substitutes ? (
            <>
              <div className="border-b bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Repeat className="h-3.5 w-3.5" />
                  {substitutes.soughtName} is not available
                </div>
                {substitutes.soughtComposition && (
                  <div className="truncate text-xs text-muted-foreground">
                    {substitutes.soughtComposition}
                  </div>
                )}
              </div>
              {substitutes.note ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">{substitutes.note}</div>
              ) : (
                <>
                  <div className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Same composition, in stock
                  </div>
                  {substitutes.options.map((opt) => {
                    const inCart = items.find((i) => i.id === opt.itemId);
                    return (
                      <button
                        type="button"
                        key={opt.itemId}
                        disabled={!inCart}
                        onClick={() => inCart && selectItem(inCart)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                          inCart ? "hover:bg-accent/50" : "opacity-60"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{opt.name}</span>
                            {opt.scheduleClass !== "none" && (
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                {opt.scheduleClass}
                              </Badge>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {opt.manufacturer || "—"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-medium tabular-nums">₹{opt.rate.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">{opt.inStock} in stock</div>
                        </div>
                      </button>
                    );
                  })}
                  <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                    Same salts at the same strengths. A prescription still decides what is
                    dispensed.
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
