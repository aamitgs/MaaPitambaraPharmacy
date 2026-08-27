"use client";

import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { getDashboardData } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SalesTrendChart } from "@/components/dashboard/sales-trend-chart";
import { QuickTiles } from "@/components/dashboard/quick-tiles";
import { TopBarPortal } from "@/components/topbar-portal";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Clock,
  DatabaseBackup,
  HandCoins,
  IndianRupee,
  PackageX,
  Receipt,
} from "lucide-react";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit",
};

/** Refreshed often enough that a second till's sale shows up without a
 *  reload, cheap enough not to matter: react-query already pauses this
 *  while the tab is in the background. */
const REFRESH_INTERVAL_MS = 20_000;

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

/** Small KPI tile. `tone` colours only the number, never the label. */
function StatTile({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "warning" | "critical";
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Icon className="h-4 w-4 text-brand-gold" />
          </div>
          <div
            className={cn(
              "mt-2 text-xl font-semibold tabular-nums",
              tone === "warning" && "text-warning-foreground",
              tone === "critical" && "text-destructive"
            )}
          >
            {value}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

/** A small pulsing dot plus how long ago the numbers below it were last
 *  confirmed against the database — the one visible sign that this screen
 *  is live rather than a snapshot from whenever it was opened. */
function LiveIndicator({ dataUpdatedAt, isFetching }: { dataUpdatedAt: number; isFetching: boolean }) {
  return (
    <span className="ml-2 flex shrink-0 items-center gap-1.5 border-l pl-2 text-sm whitespace-nowrap text-muted-foreground">
      <span className="relative flex h-1.5 w-1.5">
        {!isFetching && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            isFetching ? "bg-muted-foreground" : "bg-success"
          )}
        />
      </span>
      {isFetching ? "Updating…" : `Live · updated ${formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}`}
    </span>
  );
}

export function LiveDashboard({ initialData }: { initialData: DashboardData }) {
  const { data, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboardData(),
    initialData,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const delta = data.todaySalesTotal - data.yesterdaySalesTotal;
  const deltaPct = data.yesterdaySalesTotal > 0 ? (delta / data.yesterdaySalesTotal) * 100 : null;

  return (
    <div className="space-y-4">
      {/* Right after the clock — the numbers below are only ever as fresh
          as the moment that clock reads, so the "live" badge belongs next
          to the time, not off with the page's own action buttons. */}
      <TopBarPortal target="topbar-clock-status">
        <LiveIndicator dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} />
      </TopBarPortal>

      {/* Sticky rail: -mx-6 + px-6 lets it span the page's padding so the
          content scrolling under it is covered, and top-0 sticks it to the
          shell's scroll container rather than the window. */}
      <div className="sticky top-0 z-20 -mx-6 border-b bg-background/95 px-6 py-3 supports-backdrop-filter:bg-background/75 supports-backdrop-filter:backdrop-blur">
        <QuickTiles
          role={data.role}
          alertCount={data.lowStockCount + data.nearExpiryCount + data.licenseExpiryCount}
          lowStockCount={data.lowStockCount}
          nearExpiryCount={data.nearExpiryCount}
          openPurchaseOrderCount={data.openPurchaseOrderCount}
          todayInvoiceCount={data.todaySalesCount}
          supplierOutstanding={data.supplierOutstandingTotal}
          backupStale={data.backupStatus.isStale}
        />
      </div>

      {data.backupStatus.isStale && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backup overdue</AlertTitle>
          <AlertDescription>
            {data.backupStatus.lastBackupAt
              ? `Last backup was ${formatDistanceToNow(data.backupStatus.lastBackupAt)} ago.`
              : "No backup has been taken yet."}{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Run one now
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {data.licenseExpiryCount > 0 && data.licenseExpirySoonest && (
        <Alert
          variant={data.licenseExpirySoonest.severity === "upcoming" ? "default" : "destructive"}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {data.licenseExpiryCount === 1
              ? "License renewal due"
              : `${data.licenseExpiryCount} license renewals due`}
          </AlertTitle>
          <AlertDescription>
            {data.licenseExpirySoonest.label} ({data.licenseExpirySoonest.branchName}){" "}
            {data.licenseExpirySoonest.severity === "expired"
              ? "has expired."
              : `expires in ${data.licenseExpirySoonest.daysRemaining} day${
                  data.licenseExpirySoonest.daysRemaining === 1 ? "" : "s"
                }.`}{" "}
            <Link href="/alerts" className="underline underline-offset-2">
              Review
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* The headline number gets its own card and the brand's maroon —
            everything else on the screen is support for it. */}
        <Card className="border-brand-maroon/20 bg-brand-maroon/[0.03]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              {/* "Takings", not "sales": this is net of refunds, so it is the
                  figure the drawer should actually match at cash-up. */}
              <span className="text-xs font-medium text-muted-foreground">
                Today&apos;s takings
              </span>
              <Receipt className="h-4 w-4 text-brand-maroon" />
            </div>
            <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-brand-maroon">
              ₹{data.todaySalesTotal.toFixed(2)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.todaySalesCount} invoice{data.todaySalesCount === 1 ? "" : "s"} today
            </p>
            {data.todayRefundTotal > 0 && (
              <div className="mt-3 space-y-1 border-t pt-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Billed</span>
                  <span className="tabular-nums">₹{data.todayBilledTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Refunded ({data.todayRefundCount})
                  </span>
                  <span className="tabular-nums text-destructive">
                    −₹{data.todayRefundTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            <div className="mt-4 space-y-1 border-t pt-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">vs yesterday</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium tabular-nums",
                    delta > 0 && "text-success",
                    delta < 0 && "text-destructive"
                  )}
                >
                  {delta !== 0 &&
                    (delta > 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    ))}
                  {delta === 0
                    ? "no change"
                    : `₹${Math.abs(delta).toFixed(2)}${
                        deltaPct === null ? "" : ` (${Math.abs(deltaPct).toFixed(0)}%)`
                      }`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Month to date</span>
                <span className="font-medium tabular-nums">
                  ₹{data.monthToDateTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Takings — last 7 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={data.salesTrend} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile
          href="/alerts"
          label="Low stock"
          value={String(data.lowStockCount)}
          hint={`item${data.lowStockCount === 1 ? "" : "s"} below reorder level`}
          icon={PackageX}
          tone={data.lowStockCount > 0 ? "critical" : "neutral"}
        />
        <StatTile
          href="/alerts"
          label="Near expiry"
          value={String(data.nearExpiryCount)}
          hint={`batch${data.nearExpiryCount === 1 ? "" : "es"} expiring soon`}
          icon={Clock}
          tone={data.nearExpiryCount > 0 ? "warning" : "neutral"}
        />
        <StatTile
          href="/receivables"
          label="Customers owe you"
          value={`₹${data.customerOutstandingTotal.toFixed(2)}`}
          hint={
            data.customerOverdueTotal > 0
              ? `₹${data.customerOverdueTotal.toFixed(2)} overdue across ${data.overdueCustomerCount} customer${data.overdueCustomerCount === 1 ? "" : "s"}`
              : "nothing overdue"
          }
          icon={HandCoins}
          tone={data.customerOverdueTotal > 0 ? "critical" : "neutral"}
        />
        <StatTile
          href="/suppliers"
          label="Supplier outstanding"
          value={`₹${data.supplierOutstandingTotal.toFixed(2)}`}
          hint="owed across all suppliers"
          icon={IndianRupee}
          tone={data.supplierOutstandingTotal > 0 ? "critical" : "neutral"}
        />
        <StatTile
          href="/settings"
          label="Last backup"
          value={
            data.backupStatus.lastBackupAt
              ? formatDistanceToNow(data.backupStatus.lastBackupAt, { addSuffix: true })
              : "Never"
          }
          hint={data.backupStatus.lastBackupStatus ?? "no backups yet"}
          icon={DatabaseBackup}
          tone={data.backupStatus.isStale ? "critical" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent invoices
            </CardTitle>
            <Link
              href="/invoices"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recentInvoices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sales yet. Start one from Billing.
              </p>
            ) : (
              <div className="divide-y">
                {data.recentInvoices.map((invoice) => (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}/receipt`}
                    className="flex items-center justify-between py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{invoice.invoiceNo}</div>
                      <div className="text-xs text-muted-foreground">
                        {invoice.customerName ?? "Walk-in"} ·{" "}
                        {PAYMENT_LABELS[invoice.paymentMode] ?? invoice.paymentMode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium tabular-nums">₹{invoice.total.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(invoice.invoiceDate), "dd MMM, h:mm a")}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
