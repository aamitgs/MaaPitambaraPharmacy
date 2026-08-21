import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listSuppliers } from "@/lib/actions/suppliers";
import { listItems } from "@/lib/actions/items";
import { GrnForm } from "@/components/purchasing/grn-form";
import { hasPermission } from "@/lib/rbac";

export default async function NewGrnPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [suppliers, items, tenant, mayPriceWholesale] = await Promise.all([
    listSuppliers(),
    listItems(),
    prisma.tenant.findUniqueOrThrow({
      where: { id: session.user.tenantId },
      select: { wholesaleBillingEnabled: true },
    }),
    hasPermission("sales.wholesale"),
  ]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">New GRN (goods received)</h1>
      <Suspense fallback={null}>
        <GrnForm
          suppliers={suppliers}
          items={items}
          wholesaleBillingEnabled={tenant.wholesaleBillingEnabled && mayPriceWholesale}
        />
      </Suspense>
    </div>
  );
}
