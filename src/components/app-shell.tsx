"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { BranchSwitcher } from "@/components/branch-switcher";
import { BrandLockupHorizontal } from "@/components/brand-mark";
import { CurrentTime } from "@/components/current-time";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Users,
  Stethoscope,
  Receipt,
  Truck,
  ClipboardList,
  PackageCheck,
  Undo2,
  TriangleAlert,
  ShieldAlert,
  FileSpreadsheet,
  Building2,
  ArrowLeftRight,
  Settings,
  Percent,
  Award,
  Ticket,
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
  { href: "/transfers", label: "Stock Transfers", icon: ArrowLeftRight },
  {
    href: "/branches",
    label: "Branches",
    icon: Building2,
    roles: ["owner", "pharmacist"],
  },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/doctors", label: "Doctors", icon: Stethoscope },
  { href: "/invoices", label: "Invoices", icon: Receipt },
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
    href: "/reports/gstr-export",
    label: "GSTR-1 / 3B Export",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  user,
  branchScope,
  children,
}: {
  user: { name: string; role: UserRole; pharmacyName: string };
  branchScope: {
    branches: { id: string; name: string }[];
    branchId: string | null;
    isAllBranches: boolean;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground print:hidden">
        {/* The lockup carries the name, so no separate text label here. The
            tenant's own name stays as the accessible name for the image. */}
        <div className="flex h-14 items-center border-b px-3">
          <BrandLockupHorizontal className="h-10 w-auto" alt={user.pharmacyName} />
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <div className="mb-1.5 truncate px-2 text-xs text-sidebar-foreground/60">
            {user.name} · {user.role.replace("_", " ")}
          </div>
          <SignOutButton variant="ghost" size="sm" className="w-full justify-start">
            Sign out
          </SignOutButton>
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-x-hidden bg-background print:w-full">
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 print:hidden">
          <CurrentTime />
          <BranchSwitcher
            branches={branchScope.branches}
            selectedBranchId={branchScope.branchId}
            isAllBranches={branchScope.isAllBranches}
            canViewAll={user.role === "owner"}
          />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
