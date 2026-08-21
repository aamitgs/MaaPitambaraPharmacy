import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { listAdjustableBatches } from "@/lib/actions/stock-adjustments";
import { AdjustmentForm } from "@/components/stock/adjustment-form";

export default async function NewStockAdjustmentPage() {
  if (!(await hasPermission("stock.adjust"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to adjust stock</p>
        <p className="text-sm">
          Writing stock off needs the &ldquo;Write stock off&rdquo; permission — ask the owner.
        </p>
      </div>
    );
  }
  const batches = await listAdjustableBatches();
  return <AdjustmentForm batches={batches} />;
}
