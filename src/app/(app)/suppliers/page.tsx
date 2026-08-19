import Link from "next/link";
import { auth } from "@/auth";
import { listSuppliers } from "@/lib/actions/suppliers";
import { SuppliersTable } from "@/components/suppliers/suppliers-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function SuppliersPage() {
  const session = await auth();
  const suppliers = await listSuppliers();
  const canEdit = session?.user.role === "owner" || session?.user.role === "pharmacist";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"} on file
          </p>
        </div>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/suppliers/new">
              <Plus /> Add supplier
            </Link>
          </Button>
        )}
      </div>
      <SuppliersTable suppliers={suppliers} />
    </div>
  );
}
