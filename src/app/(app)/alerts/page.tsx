import Link from "next/link";
import { auth } from "@/auth";
import { getAlerts } from "@/lib/actions/alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { FilePlus2, TriangleAlert } from "lucide-react";

export default async function AlertsPage() {
  const session = await auth();
  const {
    lowStock,
    nearExpiry,
    nearExpiryWindowDays,
    licenseExpiry,
    licenseExpiryWindowDays,
    complianceGaps,
  } = await getAlerts();
  const canEdit = session?.user.role === "owner" || session?.user.role === "pharmacist";

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-lg font-semibold">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Live stock issues that need attention — act on them directly from here.
        </p>
      </div>

      {complianceGaps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">
            Missing from your bills{" "}
            <span className="text-muted-foreground">({complianceGaps.length})</span>
          </h2>
          <div className="space-y-2">
            {complianceGaps.map((gap, i) => (
              <div
                key={`${gap.branchId}-${gap.field}-${i}`}
                className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {gap.field} not recorded
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · {gap.branchName}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{gap.why}</p>
                </div>
                {canEdit && (
                  <Link
                    href={`/branches/${gap.branchId}`}
                    className="shrink-0 text-xs font-medium underline underline-offset-2"
                  >
                    Add it
                  </Link>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Each of these is blank, so it is simply left off the printed bill — the bill looks
            fine on screen while being incomplete on paper.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          License renewals{" "}
          <span className="text-muted-foreground">
            ({licenseExpiry.length}) — within {licenseExpiryWindowDays} days
          </span>
        </h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>License no.</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="w-32" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenseExpiry.length ? (
                licenseExpiry.map((row) => (
                  <TableRow key={`${row.branchId}-${row.licenseType}`}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell>{row.branchName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.licenseNo || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(row.expiryDate, "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {row.severity === "expired" ? (
                        <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <TriangleAlert className="h-3 w-3" /> Expired
                        </Badge>
                      ) : row.severity === "urgent" ? (
                        <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <TriangleAlert className="h-3 w-3" /> {row.daysRemaining}d left
                        </Badge>
                      ) : (
                        <Badge className="gap-1 bg-warning/20 text-warning-foreground hover:bg-warning/20">
                          <TriangleAlert className="h-3 w-3" /> {row.daysRemaining}d left
                        </Badge>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/settings">Update</Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canEdit ? 6 : 5} className="h-20 text-center text-muted-foreground">
                    No license renewals due within the window.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">
            Low stock <span className="text-muted-foreground">({lowStock.length})</span>
          </h2>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Current qty</TableHead>
                <TableHead className="text-right">Reorder level</TableHead>
                <TableHead>Last purchase</TableHead>
                {canEdit && <TableHead className="w-32" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStock.length ? (
                lowStock.map((row) => (
                  <TableRow key={row.itemId}>
                    <TableCell>
                      <Link href={`/items/${row.itemId}`} className="font-medium hover:underline">
                        {row.itemName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.currentQty}
                      {row.currentQty === 0 && (
                        <Badge className="ml-1.5 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          Out of stock
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.reorderLevel}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.lastPurchase ? (
                        <>
                          ₹{row.lastPurchase.rate.toFixed(2)} from {row.lastPurchase.supplierName}
                        </>
                      ) : (
                        "No purchase history"
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/grn/new?itemId=${row.itemId}${
                              row.lastPurchase ? `&supplierId=${row.lastPurchase.supplierId}` : ""
                            }`}
                          >
                            <FilePlus2 /> Create GRN
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canEdit ? 5 : 4} className="h-20 text-center text-muted-foreground">
                    No items are below their reorder level.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          Near expiry{" "}
          <span className="text-muted-foreground">
            ({nearExpiry.length}) — within {nearExpiryWindowDays} days
          </span>
        </h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nearExpiry.length ? (
                nearExpiry.map((row) => (
                  <TableRow key={row.batchId}>
                    <TableCell>
                      <Link href={`/items/${row.itemId}`} className="font-medium hover:underline">
                        {row.itemName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.batchNo}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(row.expiryDate), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.currentQty}</TableCell>
                    <TableCell>
                      {row.isExpired ? (
                        <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <TriangleAlert className="h-3 w-3" /> Expired
                        </Badge>
                      ) : (
                        <Badge className="gap-1 bg-warning/20 text-warning-foreground hover:bg-warning/20">
                          <TriangleAlert className="h-3 w-3" /> Near expiry
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No batches expiring within the window.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
