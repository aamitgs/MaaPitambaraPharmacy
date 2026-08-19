import { Suspense } from "react";
import { listSuppliers } from "@/lib/actions/suppliers";
import { listItems } from "@/lib/actions/items";
import { PurchaseReturnForm } from "@/components/purchasing/purchase-return-form";

export default async function NewPurchaseReturnPage() {
  const [suppliers, items] = await Promise.all([listSuppliers(), listItems()]);
  const returnableItems = items.filter((i) => i.batches.some((b) => b.currentQty > 0));

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">New purchase return</h1>
      <Suspense fallback={null}>
        <PurchaseReturnForm suppliers={suppliers} items={returnableItems} />
      </Suspense>
    </div>
  );
}
