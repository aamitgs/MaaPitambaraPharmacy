import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getSupplier } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/button";
import { SupplierLedgerTable } from "@/components/suppliers/supplier-ledger-table";
import { SupplierPaymentForm } from "@/components/suppliers/supplier-payment-form";
import { ChevronLeft, FileImage, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;

  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const canEdit = session.user.role === "owner" || session.user.role === "pharmacist";

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/suppliers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Suppliers
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">
            {supplier.gstin || "No GSTIN on file"} · {supplier.address || "No address on file"}
            {supplier.paymentTermsDays != null && ` · ${supplier.paymentTermsDays} day terms`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {supplier.documentImageUrl && (
            <Button asChild variant="outline" size="sm">
              {/* New tab rather than inline: the upload may be a PDF, and the
                  browser's own viewer handles both better than we would. */}
              <a
                href={`/api/files/purchase-invoices/${supplier.documentImageUrl}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileImage /> Card / cheque
              </a>
            </Button>
          )}
          {canEdit && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/suppliers/${supplier.id}/edit`}>
                <Pencil /> Edit supplier
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Outstanding balance</div>
        <div
          className={cn(
            "text-2xl font-semibold tabular-nums",
            supplier.outstandingBalance > 0 && "text-destructive"
          )}
        >
          ₹{supplier.outstandingBalance.toFixed(2)}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-medium">Ledger</h2>
        {canEdit && <SupplierPaymentForm supplierId={supplier.id} />}
      </div>
      <SupplierLedgerTable entries={supplier.ledgerEntries} />
    </div>
  );
}
