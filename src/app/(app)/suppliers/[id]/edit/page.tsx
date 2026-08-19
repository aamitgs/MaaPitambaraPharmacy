import { notFound } from "next/navigation";
import { getSupplier } from "@/lib/actions/suppliers";
import { SupplierForm } from "@/components/suppliers/supplier-form";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Edit supplier</h1>
      <SupplierForm supplier={supplier} />
    </div>
  );
}
