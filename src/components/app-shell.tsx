"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import type { NoteItem } from "@/lib/actions/notes";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { BranchSwitcher } from "@/components/branch-switcher";
import { useState } from "react";
import { BrandLockupHorizontal, BrandMark } from "@/components/brand-mark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { CurrentTime } from "@/components/current-time";
import { GlobalSearch } from "@/components/search/global-search";
import { NotesPanel } from "@/components/notes/notes-panel";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Users,
  Wallet,
  Stethoscope,
  Receipt,
  ScrollText,
  Banknote,
  Truck,
  ClipboardList,
  PackageCheck,
  Undo2,
  ReceiptText,
  TriangleAlert,
  ShieldAlert,
  ShieldCheck,
  FileSpreadsheet,
  HandCoins,
  BookmarkCheck,
  Building2,
  ClipboardCheck,
  ArrowLeftRight,
  Settings,
  Palette,
  MessagesSquare,
  Percent,
  Award,
  Ticket,
  UserCog,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alerts", label: "Alerts", icon: TriangleAlert },
  { href: "/pos", label: "Billing", icon: ScanBarcode },
  { href: "/items", label: "Items & Batches", icon: Package },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/grn", label: "GRN", icon: PackageCheck },
  { href: "/purchase-returns", label: "Purchase Returns", icon: Undo2 },
  { href: "/sales-returns", label: "Sales Returns", icon: ReceiptText },
  { href: "/transfers", label: "Stock Transfers", icon: ArrowLeftRight },
  {
    href: "/stock-counts",
    label: "Stock Counts",
    icon: ClipboardList,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/stock-adjustments",
    label: "Stock Adjustments",
    icon: ClipboardCheck,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/branches",
    label: "Branches",
    icon: Building2,
    roles: ["owner", "pharmacist"],
  },
  { href: "/promise-orders", label: "Promise Orders", icon: BookmarkCheck },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/receivables", label: "Receivables", icon: HandCoins },
  {
    href: "/payables",
    label: "Payables",
    icon: HandCoins,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/expenses",
    label: "Expenses",
    icon: Wallet,
    roles: ["owner", "pharmacist"],
  },
  { href: "/communications", label: "Message Log", icon: MessagesSquare },
  { href: "/doctors", label: "Doctors", icon: Stethoscope },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/cash-up", label: "Cash-up", icon: Banknote },
  {
    href: "/schemes",
    label: "Schemes",
    icon: Percent,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/loyalty-tiers",
    label: "Loyalty Tiers",
    icon: Award,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/coupons",
    label: "Coupons",
    icon: Ticket,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/sales-register",
    label: "Sales Register",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/purchase-register",
    label: "Purchase Register",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/stock-ledger",
    label: "Stock Ledger",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/profit-loss",
    label: "Profit & Loss",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/margin",
    label: "Margin Report",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/discounts",
    label: "Discount Report",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/movers",
    label: "Fast / Slow Movers",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/schedule-h-register",
    label: "Schedule H1 Register",
    icon: ShieldAlert,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/narcotic-register",
    label: "Narcotic Register",
    icon: ShieldAlert,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/hsn-summary",
    label: "HSN Summary",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/tax-slabs",
    label: "GST Slabs",
    icon: Percent,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/gstr-export",
    label: "GSTR-1 / 3B Export",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/staff",
    label: "Staff & Roles",
    icon: UserCog,
    // Owner-only in the menu as well as on the page: the screen that hands
    // out access shouldn't advertise itself to the people it governs.
    roles: ["owner"],
  },
  // Everyone manages their own second factor, so no role gate here.
  { href: "/security", label: "Security", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
  {
    href: "/audit",
    label: "Audit Log",
    icon: ScrollText,
    // Owner-only: it is the record of what everyone else did.
    roles: ["owner"],
  },
  {
    href: "/branding",
    label: "Branding",
    icon: Palette,
    // Last, and owner-only in the menu as well as on the page: this is what
    // the pharmacy looks like to a customer holding a bill.
    roles: ["owner"],
  },
];

export function AppShell({
  user,
  logo,
  notes,
  branchScope,
  defaultCollapsed = false,
  children,
}: {
  user: { name: string; role: UserRole; pharmacyName: string };
  /** Resolved server-side — this component is a client component, so it
   *  cannot read branding itself. */
  logo: { icon: string; horizontal: string };
  notes: NoteItem[];
  branchScope: {
    branches: { id: string; name: string }[];
    branchId: string | null;
    isAllBranches: boolean;
  };
  /** Read from a cookie server-side so a collapsed sidebar doesn't flash
   *  open on every navigation. */
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // Written directly rather than through a server action: this is a UI
    // preference, not tenant data, and a round-trip would make the toggle
    // feel laggy.
    document.cookie = `sidebar-collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    /* Viewport-height shell: the nav scrolls inside its own column so the
       signed-in user and Sign out stay pinned at the bottom however long the
       menu gets. Released for print, where a fixed-height scroll container
       would clip a receipt. */
    <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 print:hidden",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* The lockup carries the name, so no separate text label here; the
            tenant's own name stays as the image's accessible name. Collapsed,
            it falls back to the roundel, which reads at a small size where a
            3:1 lockup would not. */}
        <div
          className={cn(
            "flex h-16 items-center border-b",
            collapsed ? "justify-center px-2" : "px-3"
          )}
        >
          {collapsed ? (
            <BrandMark src={logo.icon} className="h-9 w-9" alt={user.pharmacyName} />
          ) : (
            <BrandLockupHorizontal
              src={logo.horizontal}
              className="h-12 w-auto"
              alt={user.pharmacyName}
            />
          )}
        </div>
        {/* min-h-0 is what actually lets this scroll — without it a flex
            child refuses to shrink below its content height. */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            const link = (
              <Link
                key={item.href}
                href={item.href}
                aria-label={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md py-1.5 text-sm transition-colors",
                  collapsed ? "justify-center px-2" : "px-2.5",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
            // Collapsed, the icon is the only label there is — a tooltip is
            // the difference between a usable rail and a guessing game.
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </nav>
        <div className="border-t p-2">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <SignOutButton variant="ghost" size="icon-sm" className="w-full">
                  <LogOut className="h-4 w-4" />
                  <span className="sr-only">Sign out</span>
                </SignOutButton>
              </TooltipTrigger>
              <TooltipContent side="right">
                Sign out — {user.name}
              </TooltipContent>
            </Tooltip>
          ) : (
            <>
              {/* The signed-in name carries the brand maroon; the role stays
                  muted so the two read as name-then-qualifier, not one blob. */}
              <div className="mb-1.5 truncate px-2 text-xs">
                <span className="font-semibold text-brand-maroon">{user.name}</span>
                <span className="text-sidebar-foreground/60">
                  {" "}
                  · {user.role.replace("_", " ")}
                </span>
              </div>
              <SignOutButton variant="ghost" size="sm" className="w-full justify-start">
                Sign out
              </SignOutButton>
            </>
          )}
        </div>
      </aside>
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-background print:h-auto print:w-full print:overflow-visible">
        <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-4 print:hidden">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
            <CurrentTime />
            {/* A page can portal a status badge in right after the clock —
                the dashboard's live-update indicator, for one — rather than
                it competing for space with the actions on the other side. */}
            <div id="topbar-clock-status" />
          </div>
          {/* Pages render their own actions here through TopBarPortal, so the
              app keeps one header row rather than each screen adding its own. */}
          <div className="flex items-center gap-2">
            {/* Search and notes sit in the shell, not on a page: both are
                wanted from wherever staff happen to be standing. */}
            <GlobalSearch />
            <NotesPanel notes={notes} role={user.role} />
            <div id="topbar-actions" className="flex items-center gap-2" />
            <BranchSwitcher
              branches={branchScope.branches}
              selectedBranchId={branchScope.branchId}
              isAllBranches={branchScope.isAllBranches}
              canViewAll={user.role === "owner"}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
      </main>
    </div>
  );
}
