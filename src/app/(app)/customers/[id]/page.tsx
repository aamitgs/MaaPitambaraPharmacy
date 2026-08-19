import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getCustomer } from "@/lib/actions/customers";
import { Button } from "@/components/ui/button";
import { CustomerLedgerTable } from "@/components/customers/customer-ledger-table";
import { CustomerPaymentForm } from "@/components/customers/customer-payment-form";
import { ChevronLeft, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;

  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const canManage = session.user.role === "owner" || session.user.role === "pharmacist";

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Customers
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {customer.phone || "No phone on file"}
            {customer.creditLimit !== null && ` · Credit limit ₹${customer.creditLimit.toFixed(2)}`}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/customers/${customer.id}/statement`}>
            <FileText /> Statement of account
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">Outstanding balance</div>
        <div
          className={cn(
            "text-2xl font-semibold tabular-nums",
            customer.outstandingBalance > 0 && "text-destructive"
          )}
        >
          ₹{customer.outstandingBalance.toFixed(2)}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-medium">Ledger</h2>
        {canManage && <CustomerPaymentForm customerId={customer.id} />}
      </div>
      <CustomerLedgerTable entries={customer.ledgerEntries} />
    </div>
  );
}
