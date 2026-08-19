import { SupplierForm } from "@/components/suppliers/supplier-form";

export default function NewSupplierPage() {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Add supplier</h1>
      <SupplierForm />
    </div>
  );
}
