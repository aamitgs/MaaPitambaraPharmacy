import { listSuppliers } from "@/lib/actions/suppliers";
import { listItems } from "@/lib/actions/items";
import { PoForm } from "@/components/purchasing/po-form";

export default async function NewPurchaseOrderPage() {
  const [suppliers, items] = await Promise.all([listSuppliers(), listItems()]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">New purchase order</h1>
      <PoForm suppliers={suppliers} items={items} />
    </div>
  );
}
