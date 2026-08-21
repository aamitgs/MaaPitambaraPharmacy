import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { listTaxSlabs } from "@/lib/actions/tax-slabs";
import { TaxSlabManager } from "@/components/tax/tax-slab-manager";

export default async function TaxSlabsPage() {
  if (!(await hasPermission("compliance.manage"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to change tax settings</p>
        <p className="text-sm">
          A rate change affects every future bill and what gets filed, so it needs the compliance
          permission.
        </p>
      </div>
    );
  }
  const slabs = await listTaxSlabs();
  return <TaxSlabManager slabs={slabs} />;
}
