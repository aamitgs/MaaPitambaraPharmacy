"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export type PurchasableItem = {
  id: string;
  name: string;
  genericName: string | null;
  manufacturer: string | null;
  scheduleClass: string;
  totalQty?: number;
};

function matches(item: PurchasableItem, q: string) {
  const needle = q.toLowerCase();
  return (
    item.name.toLowerCase().includes(needle) ||
    (item.genericName?.toLowerCase().includes(needle) ?? false) ||
    (item.manufacturer?.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * Item search + select used in the GRN/PO fast row-entry bars. Unlike the
 * POS SearchPanel (select = immediately add to cart), selecting here just
 * fills this field so the caller can move focus on to the next one — the
 * row itself isn't committed until every field is filled.
 */
export function ItemCombobox({
  items,
  selectedItem,
  onSelect,
  onClear,
  onEnterWithNoSelection,
  inputRef,
  placeholder = "Search item by name…",
}: {
  items: PurchasableItem[];
  selectedItem: PurchasableItem | null;
  onSelect: (item: PurchasableItem) => void;
  onClear: () => void;
  onEnterWithNoSelection?: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

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
      .slice(0, 10);
  }, [items, query]);

  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setHighlighted(0);
  }

  function selectItem(item: PurchasableItem) {
    onSelect(item);
    setQuery("");
    setHighlighted(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
      else onEnterWithNoSelection?.();
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  if (selectedItem) {
    return (
      <div className="flex h-9 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-sm">
        <span className="flex items-center gap-1.5 truncate">
          <span className="truncate font-medium">{selectedItem.name}</span>
          {selectedItem.scheduleClass !== "none" && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {selectedItem.scheduleClass}
            </Badge>
          )}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Change item"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-9"
      />
      {results.length > 0 && (
        <div className="absolute z-40 mt-1 w-72 overflow-hidden rounded-lg border bg-popover shadow-md">
          {results.map((item, i) => (
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
                </div>
              </div>
              {item.totalQty != null && (
                <div className="shrink-0 text-xs text-muted-foreground">{item.totalQty} in stock</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
