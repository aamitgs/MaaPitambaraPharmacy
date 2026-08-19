import { auth } from "@/auth";
import { listCoupons } from "@/lib/actions/coupons";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { CouponForm } from "@/components/coupons/coupon-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default async function CouponsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const coupons = await listCoupons();
  const canManage = session.user.role === "owner";
  const now = new Date();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Coupons</h1>
          <p className="text-sm text-muted-foreground">
            {coupons.length} coupon{coupons.length === 1 ? "" : "s"} — entered by code at billing
          </p>
        </div>
        {canManage && <CouponForm />}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Valid window</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.length ? (
              coupons.map((c) => {
                const inWindow = new Date(c.validFrom) <= now && now <= new Date(c.validTo);
                const exhausted = c.usageLimit !== null && c.usageCount >= c.usageLimit;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.code}
                      {c.singleUsePerCustomer && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          1 per customer
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.type === "percent" ? `${c.value}%` : `₹${c.value.toFixed(2)}`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(c.validFrom), "dd MMM yyyy")} – {format(new Date(c.validTo), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {c.usageCount}
                      {c.usageLimit !== null ? ` / ${c.usageLimit}` : ""}
                    </TableCell>
                    <TableCell>
                      {inWindow && !exhausted ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/15">Live</Badge>
                      ) : exhausted ? (
                        <Badge variant="outline">Exhausted</Badge>
                      ) : (
                        <Badge variant="outline">Out of window</Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <CouponForm
                          coupon={c}
                          trigger={
                            <Button size="sm" variant="outline">
                              Edit
                            </Button>
                          }
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No coupons yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
