"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PendingSale } from "@/lib/offline/db";
import { WifiOff, RefreshCw, Trash2, Loader2 } from "lucide-react";

const STATUS_LABEL: Record<PendingSale["status"], string> = {
  pending: "Pending sync",
  syncing: "Syncing…",
  synced: "Synced",
  conflict: "Conflict — needs review",
  failed: "Failed — will retry",
  stale: "Held — too old to post by itself",
};

const STATUS_COLOR: Record<PendingSale["status"], string> = {
  pending: "bg-warning/20 text-warning-foreground",
  syncing: "bg-muted text-muted-foreground",
  synced: "bg-success/15 text-success",
  conflict: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/10 text-destructive",
  stale: "bg-warning/25 text-warning-foreground",
};

/**
 * A persistent, unmissable status bar — not a dismissible toast — since
 * staff must never be left guessing whether a bill actually reached the
 * server. Renders whenever offline OR whenever anything is still unsynced,
 * even after connectivity returns (so a mid-sync state stays visible).
 */
export function OfflineBanner({
  isOnline,
  syncing,
  pendingSales,
  onRetrySync,
  onDiscard,
  onPostAnyway,
}: {
  isOnline: boolean;
  syncing: boolean;
  pendingSales: PendingSale[];
  onRetrySync: () => void;
  onDiscard: (localId: string) => void;
  /// Posts one held sale despite its age — a deliberate, per-sale decision,
  /// never a bulk "sync everything anyway" button.
  onPostAnyway: (localId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const unsynced = pendingSales.filter((s) => s.status !== "synced");

  if (isOnline && unsynced.length === 0 && !syncing) return null;

  const label = !isOnline
    ? `Offline — ${unsynced.length} bill${unsynced.length === 1 ? "" : "s"} pending sync`
    : syncing
      ? `Back online — syncing ${unsynced.length} bill${unsynced.length === 1 ? "" : "s"}…`
      : `${unsynced.length} bill${unsynced.length === 1 ? "" : "s"} pending sync`;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-sm font-medium",
        !isOnline ? "bg-destructive text-destructive-foreground" : "bg-warning/90 text-warning-foreground"
      )}
    >
      <div className="flex items-center gap-2">
        {!isOnline && <WifiOff className="h-4 w-4" />}
        {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </div>
      <div className="flex items-center gap-2">
        {isOnline && unsynced.length > 0 && !syncing && (
          <Button size="sm" variant="secondary" onClick={onRetrySync}>
            <RefreshCw className="h-3.5 w-3.5" /> Sync now
          </Button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="secondary">
              View queue
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 space-y-2">
            <div className="text-sm font-semibold">Offline sale queue</div>
            {pendingSales.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing queued.</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {pendingSales.map((sale) => (
                  <div key={sale.localId} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {format(new Date(sale.createdAt), "dd MMM, h:mm a")}
                      </span>
                      <Badge className={cn("text-[10px]", STATUS_COLOR[sale.status])}>
                        {STATUS_LABEL[sale.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>
                        {sale.summary.itemCount} item{sale.summary.itemCount === 1 ? "" : "s"} · ₹
                        {sale.summary.total.toFixed(2)} · {sale.summary.paymentMode}
                      </span>
                      {(sale.status === "conflict" ||
                        sale.status === "failed" ||
                        sale.status === "stale") && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => onDiscard(sale.localId)}
                          aria-label="Discard queued sale"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {sale.message && (
                      <div
                        className={cn(
                          "mt-1",
                          sale.status === "stale" ? "text-warning-foreground" : "text-destructive"
                        )}
                      >
                        {sale.message}
                      </div>
                    )}
                    {sale.status === "stale" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1.5 h-7 w-full text-xs"
                        onClick={() => onPostAnyway(sale.localId)}
                      >
                        Post it anyway
                      </Button>
                    )}
                    {sale.invoiceNo && (
                      <div className="mt-1 text-success">Synced as {sale.invoiceNo}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
