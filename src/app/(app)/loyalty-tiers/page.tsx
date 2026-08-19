import { auth } from "@/auth";
import { listLoyaltyTiers } from "@/lib/actions/loyalty-tiers";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { LoyaltyTierForm } from "@/components/loyalty/loyalty-tier-form";
import { DeleteTierButton } from "@/components/loyalty/delete-tier-button";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function LoyaltyTiersPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const tiers = await listLoyaltyTiers();
  const canManage = session.user.role === "owner";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Loyalty Tiers</h1>
          <p className="text-sm text-muted-foreground">
            A customer&apos;s tier is assigned automatically as their cumulative spend crosses these thresholds.
          </p>
        </div>
        {canManage && <LoyaltyTierForm />}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Min. cumulative spend</TableHead>
              <TableHead className="text-right">Discount %</TableHead>
              {canManage && <TableHead className="w-36" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.length ? (
              tiers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-right tabular-nums">₹{t.minCumulativeSpend.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.discountPercent}%</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <LoyaltyTierForm
                          tier={t}
                          trigger={
                            <Button size="sm" variant="outline">
                              Edit
                            </Button>
                          }
                        />
                        <DeleteTierButton tierId={t.id} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No loyalty tiers yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
