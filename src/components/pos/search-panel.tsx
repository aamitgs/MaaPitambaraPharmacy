"use client";

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { PosItem } from "./types";

function matches(item: PosItem, q: string) {
  const needle = q.toLowerCase();
  return (
    item.name.toLowerCase().includes(needle) ||
    (item.genericName?.toLowerCase().includes(needle) ?? false) ||
    (item.manufacturer?.toLowerCase().includes(needle) ?? false) ||
    (item.hsnCode?.toLowerCase().includes(needle) ?? false)
  );
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
  }

  function selectItem(item: PosItem) {
    onSelect(item);
    setQuery("");
    setHighlighted(0);
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
        placeholder="Search by item name, generic name, or scan barcode…"
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
                  <div className="text-xs text-muted-foreground">{totalQty} in stock</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
