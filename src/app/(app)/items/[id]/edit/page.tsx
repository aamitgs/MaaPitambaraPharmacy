import { notFound } from "next/navigation";
import { getItem } from "@/lib/actions/items";
import { ItemForm } from "@/components/items/item-form";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Edit item</h1>
      <ItemForm item={item} />
    </div>
  );
}
