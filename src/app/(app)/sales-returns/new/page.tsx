import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { getReturnableInvoice } from "@/lib/actions/sales-returns";
import { SalesReturnForm } from "@/components/sales-returns/sales-return-form";

export default async function NewSalesReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const { invoiceId } = await searchParams;

  // Checked before the query so a role without it gets an explanation
  // rather than a server error.
  if (!(await hasPermission("sales.cancel"))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Not allowed to process returns</p>
        <p className="text-sm">
          Ask the owner to grant your role the &ldquo;Cancel or refund an invoice&rdquo;
          permission under Staff &amp; Roles.
        </p>
      </div>
    );
  }

  if (!invoiceId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Start a return from the bill you want to reverse —{" "}
        <Link href="/invoices" className="underline underline-offset-2">
          find it in Invoices
        </Link>
        .
      </div>
    );
  }

  const invoice = await getReturnableInvoice(invoiceId);
  if (!invoice) {
    return <div className="p-6 text-sm text-muted-foreground">That invoice was not found.</div>;
  }

  return <SalesReturnForm invoice={invoice} />;
}
