import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getDashboardData } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, IndianRupee, PackageX, Receipt } from "lucide-react";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">{data.pharmacyName}</h1>
        <p className="text-sm text-muted-foreground">Today at a glance</p>
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

      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today&apos;s sales
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              ₹{data.todaySalesTotal.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.todaySalesCount} invoice{data.todaySalesCount === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        <Link href="/alerts">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low stock
              </CardTitle>
              <PackageX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  data.lowStockCount > 0 && "text-destructive"
                )}
              >
                {data.lowStockCount}
              </div>
              <p className="text-xs text-muted-foreground">item{data.lowStockCount === 1 ? "" : "s"} below reorder level</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/alerts">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Near expiry
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  data.nearExpiryCount > 0 && "text-warning-foreground"
                )}
              >
                {data.nearExpiryCount}
              </div>
              <p className="text-xs text-muted-foreground">
                batch{data.nearExpiryCount === 1 ? "" : "es"} expiring soon
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/suppliers">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Supplier outstanding
              </CardTitle>
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  data.supplierOutstandingTotal > 0 && "text-destructive"
                )}
              >
                ₹{data.supplierOutstandingTotal.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">owed across all suppliers</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Last backup
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-semibold",
                  data.backupStatus.isStale && "text-destructive"
                )}
              >
                {data.backupStatus.lastBackupAt
                  ? formatDistanceToNow(data.backupStatus.lastBackupAt, { addSuffix: true })
                  : "Never"}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.backupStatus.lastBackupStatus ?? "no backups yet"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
