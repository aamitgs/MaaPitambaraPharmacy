import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getItem } from "@/lib/actions/items";
import { canEditItemMaster } from "@/lib/rbac";
import { LabelSheet } from "@/components/labels/label-sheet";
import { AssignBarcodeButton } from "@/components/labels/assign-barcode-button";

export default async function ItemLabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  if (!canEditItemMaster(session.user.role)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to print labels</p>
      </div>
    );
  }

  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });

  return (
    <div className="space-y-4 p-6">
      <Link
        href={`/items/${item.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ChevronLeft className="h-4 w-4" /> {item.name}
      </Link>

      <div className="print:hidden">
        <h1 className="text-lg font-semibold">Print labels</h1>
        <p className="text-sm text-muted-foreground">
          Shelf labels carrying the barcode, batch, expiry and MRP — for loose strips and repacked
          goods that came in without one.
        </p>
      </div>

      {item.barcode ? (
        <LabelSheet
          pharmacyName={tenant.pharmacyName}
          itemName={item.name}
          barcode={item.barcode}
          batches={item.batches}
        />
      ) : (
        <div className="space-y-3 rounded-lg border p-6">
          <p className="text-sm font-medium">{item.name} has no barcode yet.</p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Issue one and it can be printed and scanned like any other. Internally issued codes
            start with a 2 — the range GS1 reserves for codes used inside a single shop — so they
            can never collide with a manufacturer&apos;s printed barcode.
          </p>
          <AssignBarcodeButton itemId={item.id} itemName={item.name} />
        </div>
      )}
    </div>
  );
}
