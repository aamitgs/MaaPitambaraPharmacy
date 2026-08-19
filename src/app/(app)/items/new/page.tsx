import { ItemForm } from "@/components/items/item-form";

export default function NewItemPage() {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Add item</h1>
      <ItemForm />
    </div>
  );
}
