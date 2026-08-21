import Link from "next/link";
import { auth } from "@/auth";
import { listItems } from "@/lib/actions/items";
import { ItemsTable } from "@/components/items/items-table";
import { Button } from "@/components/ui/button";
import { Plus, Repeat } from "lucide-react";

export default async function ItemsPage() {
  const session = await auth();
  const items = await listItems();
  const canEdit = session?.user.role === "owner" || session?.user.role === "pharmacist";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Items & Batches</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} in the master
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/items/composition">
              <Repeat /> Composition
            </Link>
          </Button>
          {canEdit && (
            <Button asChild size="sm">
              <Link href="/items/new">
                <Plus /> Add item
              </Link>
            </Button>
          )}
        </div>
      </div>
      <ItemsTable items={items} />
    </div>
  );
}
