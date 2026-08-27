import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getItem } from "@/lib/actions/items";
import { listPickableTaxSlabs } from "@/lib/tax/pickable-slabs";
import { listSuppliers } from "@/lib/actions/suppliers";
import { ItemForm } from "@/components/items/item-form";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  const { id } = await params;
  const [item, taxSlabs, suppliers] = await Promise.all([
    getItem(id),
    listPickableTaxSlabs(session.user.tenantId),
    listSuppliers(),
  ]);
  if (!item) notFound();

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Edit item</h1>
      <ItemForm item={item} taxSlabs={taxSlabs} suppliers={suppliers} />
    </div>
  );
}
