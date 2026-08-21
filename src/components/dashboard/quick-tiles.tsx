"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { UserRole } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import {
  ArrowLeftRight,
  ClipboardList,
  Clock,
  DatabaseBackup,
  FileSpreadsheet,
  Package,
  PackageCheck,
  PackageX,
  Receipt,
  ScanBarcode,
  ShieldAlert,
  Stethoscope,
  TriangleAlert,
  Truck,
  Undo2,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type Tile = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shown only when set and non-zero — a row of grey noughts tells nobody
   *  anything. */
  badge?: number | string | null;
  tone?: "critical" | "warning";
  primary?: boolean;
  roles?: UserRole[];
};

/**
 * Shortcut rail under the dashboard header. Each tile is a destination that
 * also reports how much work is waiting there, so the row answers "where do
 * I go next" rather than just "what screens exist".
 *
 * Ordered the way a shift runs — sell, then stock, then people, then the
 * monitoring screens — so the left end is what gets touched hourly and the
 * right end is what gets checked daily. It scrolls horizontally only when it
 * actually overflows.
 */
export function QuickTiles({
  role,
  alertCount,
  lowStockCount,
  nearExpiryCount,
  openPurchaseOrderCount,
  todayInvoiceCount,
  supplierOutstanding,
  backupStale,
}: {
  role: UserRole;
  alertCount: number;
  lowStockCount: number;
  nearExpiryCount: number;
  openPurchaseOrderCount: number;
  todayInvoiceCount: number;
  supplierOutstanding: number;
  backupStale: boolean;
}) {
  const tiles: Tile[] = [
    // Selling — touched constantly.
    { href: "/pos", label: "New sale", icon: ScanBarcode, primary: true },
    { href: "/items", label: "Stock look-up", icon: Package },
    { href: "/invoices", label: "Invoices", icon: Receipt, badge: todayInvoiceCount },

    // Things that need attention.
    { href: "/alerts", label: "Alerts", icon: TriangleAlert, badge: alertCount, tone: "critical" },
    { href: "/alerts", label: "Low stock", icon: PackageX, badge: lowStockCount, tone: "critical" },
    { href: "/alerts", label: "Expiring", icon: Clock, badge: nearExpiryCount, tone: "warning" },

    // Buying in.
    { href: "/grn/new", label: "Receive", icon: PackageCheck },
    {
      href: "/purchase-orders",
      label: "Open POs",
      icon: ClipboardList,
      badge: openPurchaseOrderCount,
      tone: "warning",
    },
    { href: "/purchase-returns", label: "Returns", icon: Undo2 },
    {
      href: "/suppliers",
      label: "Suppliers",
      icon: Truck,
      badge: supplierOutstanding > 0 ? "₹" : null,
      tone: "warning",
    },
    { href: "/transfers", label: "Transfers", icon: ArrowLeftRight },

    // People.
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/doctors", label: "Doctors", icon: Stethoscope },

    // Monitoring — daily rather than hourly, and owner/pharmacist only.
    {
      href: "/reports/sales-register",
      label: "Sales register",
      icon: FileSpreadsheet,
      roles: ["owner", "pharmacist"],
    },
    {
      href: "/reports/stock-ledger",
      label: "Stock ledger",
      icon: FileSpreadsheet,
      roles: ["owner", "pharmacist"],
    },
    {
      href: "/reports/narcotic-register",
      label: "Narcotic reg.",
      icon: ShieldAlert,
      roles: ["owner", "pharmacist"],
    },
    {
      href: "/settings",
      label: "Backup",
      icon: DatabaseBackup,
      badge: backupStale ? "!" : null,
      tone: "critical",
    },
  ];

  const visible = tiles.filter((t) => !t.roles || t.roles.includes(role));

  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Arrows appear only when there is something to scroll to. Without them a
  // hidden scrollbar leaves a mouse-only counter machine with no way to
  // reach the tiles past the fold — shift+wheel is not discoverable.
  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  function scrollBy(direction: 1 | -1) {
    railRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  }

  return (
    <div className="relative">
      {edges.left && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll shortcuts left"
          className="absolute top-6 -left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-card shadow-md transition-colors hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {edges.right && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Scroll shortcuts right"
          className="absolute top-6 -right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-card shadow-md transition-colors hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {/* pt-2 is not decoration: overflow-x also clips vertically, so without
          headroom the badges sitting above each tile get cut off. The
          scrollbar itself is hidden — the arrows above replace it. */}
      <div
        ref={railRef}
        onScroll={measure}
        className="-mx-1 flex gap-3 overflow-x-auto px-1 pt-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
      {visible.map((tile) => {
        const Icon = tile.icon;
        const badge =
          tile.badge === null || tile.badge === undefined || tile.badge === 0 ? null : tile.badge;
        return (
          <Link
            key={tile.label}
            href={tile.href}
            className="group flex w-[76px] shrink-0 flex-col items-center gap-1.5"
          >
            <div
              className={cn(
                "relative flex h-14 w-14 items-center justify-center rounded-2xl border transition-shadow group-hover:shadow-md",
                tile.primary
                  ? "border-brand-maroon bg-brand-maroon text-brand-cream"
                  : "bg-card"
              )}
            >
              <Icon className={cn("h-5 w-5", !tile.primary && "text-brand-maroon")} />
              {badge !== null && (
                <span
                  className={cn(
                    "absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                    tile.tone === "warning"
                      ? "bg-brand-gold text-brand-maroon"
                      : "bg-destructive text-white"
                  )}
                >
                  {badge}
                </span>
              )}
            </div>
            <span className="text-center text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">
              {tile.label}
            </span>
          </Link>
        );
      })}
      </div>
    </div>
  );
}
