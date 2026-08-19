import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getItem } from "@/lib/actions/items";
import { canEditItemMaster, canViewPurchaseRate } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BatchesTable } from "@/components/items/batches-table";
import { BatchForm } from "@/components/items/batch-form";
import { ChevronLeft, Pencil } from "lucide-react";

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;

  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  const canEdit = canEditItemMaster(session.user.role);
  const showPurchaseRate = canViewPurchaseRate(session.user.role);

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/items"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Items
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/item-photos/${item.imageUrl}`}
              alt={`${item.name} pack`}
              className="h-14 w-14 shrink-0 rounded-md border object-cover"
            />
          )}
          <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{item.name}</h1>
            {item.scheduleClass !== "none" && (
              <Badge variant="outline">Schedule {item.scheduleClass}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {item.genericName || "—"} · {item.manufacturer || "—"} · HSN {item.hsnCode || "—"} ·{" "}
            {Number(item.taxRate)}% tax
          </p>
          </div>
        </div>
        {canEdit && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/items/${item.id}/edit`}>
              <Pencil /> Edit item
            </Link>
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-medium">Batches</h2>
        {canEdit && (
          <BatchForm itemId={item.id} showPurchaseRate={showPurchaseRate} />
        )}
      </div>
      <BatchesTable
        itemId={item.id}
        batches={item.batches}
        showPurchaseRate={showPurchaseRate}
        nearExpiryWindowDays={tenant.nearExpiryWindowDays}
        canEdit={canEdit}
      />
    </div>
  );
}
