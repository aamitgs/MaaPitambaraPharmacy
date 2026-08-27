import { auth } from "@/auth";
import { listPickableTaxSlabs } from "@/lib/tax/pickable-slabs";
import { listSuppliers } from "@/lib/actions/suppliers";
import { ItemForm } from "@/components/items/item-form";

export default async function NewItemPage() {
  const session = await auth();
  if (!session?.user) return null;
  const [taxSlabs, suppliers] = await Promise.all([
    listPickableTaxSlabs(session.user.tenantId),
    listSuppliers(),
  ]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Add item</h1>
      <ItemForm taxSlabs={taxSlabs} suppliers={suppliers} />
    </div>
  );
}
