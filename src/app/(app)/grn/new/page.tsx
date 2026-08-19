import { Suspense } from "react";
import { listSuppliers } from "@/lib/actions/suppliers";
import { listItems } from "@/lib/actions/items";
import { GrnForm } from "@/components/purchasing/grn-form";

export default async function NewGrnPage() {
  const [suppliers, items] = await Promise.all([listSuppliers(), listItems()]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">New GRN (goods received)</h1>
      <Suspense fallback={null}>
        <GrnForm suppliers={suppliers} items={items} />
      </Suspense>
    </div>
  );
}
