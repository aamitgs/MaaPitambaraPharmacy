import { auth } from "@/auth";
import { listPickableTaxSlabs } from "@/lib/tax/pickable-slabs";
import { ItemForm } from "@/components/items/item-form";

export default async function NewItemPage() {
  const session = await auth();
  if (!session?.user) return null;
  const taxSlabs = await listPickableTaxSlabs(session.user.tenantId);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Add item</h1>
      <ItemForm taxSlabs={taxSlabs} />
    </div>
  );
}
