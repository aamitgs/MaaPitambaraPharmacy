import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { getStockCount } from "@/lib/actions/stock-counts";
import { CountSheet } from "@/components/stock/count-sheet";

export default async function StockCountPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasPermission("stock.adjust"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to count stock</p>
      </div>
    );
  }
  const { id } = await params;
  const count = await getStockCount(id);
  if (!count) notFound();
  return <CountSheet count={count} />;
}
