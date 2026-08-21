"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { globalSearch, type SearchHit } from "@/lib/actions/search";
import {
  ArrowRight,
  ClipboardList,
  CornerDownLeft,
  Loader2,
  Package,
  PackageCheck,
  Receipt,
  ScanBarcode,
  Search,
  Stethoscope,
  TriangleAlert,
  Truck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** One icon per result type — the fastest thing to scan in a list. */
const GROUP_ICON = {
  Items: Package,
  Invoices: Receipt,
  Customers: Users,
  Doctors: Stethoscope,
  Suppliers: Truck,
} as const;

/**
 * Shown when nothing has been typed. Opening a search box to be told "type
 * something" wastes the keystroke that got you here; these are the places
 * staff jump to most.
 */
const JUMP_TO = [
  { label: "New sale", href: "/pos", icon: ScanBarcode },
  { label: "Alerts", href: "/alerts", icon: TriangleAlert },
  { label: "Receive stock", href: "/grn/new", icon: PackageCheck },
  { label: "Items & batches", href: "/items", icon: Package },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Purchase orders", href: "/purchase-orders", icon: ClipboardList },
] as const;

/**
 * One search box for the whole app — items, invoices, customers, doctors,
 * suppliers — reachable from the top bar or with Ctrl/⌘ K from any screen.
 *
 * Filtering happens on the server, so `shouldFilter` is off: cmdk's built-in
 * fuzzy match would re-filter the already-matched results and drop hits that
 * matched on a field the label doesn't show (a phone number, a generic name).
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const search = useCallback((value: string) => {
    setTerm(value);
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    // Out-of-order responses would otherwise let a stale, slower query
    // overwrite the newest results.
    const id = ++requestId.current;
    startTransition(async () => {
      const results = await globalSearch(value);
      if (id === requestId.current) setHits(results);
    });
  }, []);

  function go(href: string) {
    setOpen(false);
    setTerm("");
    setHits([]);
    router.push(href);
  }

  const groups = ["Items", "Invoices", "Customers", "Doctors", "Suppliers"] as const;

  return (
    <>
      {/* Sized like a search field rather than an icon button: it is the
          control staff reach for most, and a 32px icon hides that. */}
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-10 w-56 justify-start gap-2 px-3 text-muted-foreground lg:w-72"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search anything…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium lg:inline">
          ⌘K
        </kbd>
      </Button>

      {/* Wider than the default dialog: results carry an icon, a two-line
          label and a stock badge, and at 384px those collide. */}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Search items, invoices, customers, doctors and suppliers"
        className="sm:max-w-2xl"
      >
        {/* CommandDialog renders its children straight into the dialog, so
            the cmdk context has to be supplied here. shouldFilter is off
            because the server already did the matching. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={search}
            placeholder="Search items, invoices, customers, doctors, suppliers…"
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>
              {pending ? (
                <span className="inline-flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </span>
              ) : (
                <span className="text-sm">Nothing matched “{term.trim()}”.</span>
              )}
            </CommandEmpty>

            {term.trim().length < 2 && (
              <CommandGroup heading="Jump to">
                {JUMP_TO.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <CommandItem
                      key={entry.href}
                      value={entry.href}
                      onSelect={() => go(entry.href)}
                      className="gap-3"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-card">
                        <Icon className="h-3.5 w-3.5 text-brand-maroon" />
                      </span>
                      <span className="flex-1">{entry.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {groups.map((group) => {
              const groupHits = hits.filter((h) => h.group === group);
              if (groupHits.length === 0) return null;
              const Icon = GROUP_ICON[group];
              return (
                <CommandGroup key={group} heading={group}>
                  {groupHits.map((hit) => (
                    <CommandItem
                      key={`${hit.group}-${hit.id}`}
                      value={`${hit.group}-${hit.id}`}
                      onSelect={() => go(hit.href)}
                      className="gap-3"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-card">
                        <Icon className="h-3.5 w-3.5 text-brand-maroon" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{hit.title}</span>
                        {hit.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {hit.subtitle}
                          </span>
                        )}
                      </span>
                      {hit.stock && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                            hit.stock.low
                              ? "bg-destructive/10 text-destructive"
                              : "bg-success/10 text-success"
                          )}
                        >
                          {hit.stock.qty} in stock
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>

          {/* Keyboard hints: the palette is worth learning, and nothing else
              on screen says it can be driven without the mouse. */}
          <div className="flex items-center gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1">↑</kbd>
              <kbd className="rounded border bg-muted px-1">↓</kbd> navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" /> open
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1">esc</kbd> close
            </span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}
