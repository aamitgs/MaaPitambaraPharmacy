import { notFound } from "next/navigation";
import { getInvoiceForReceipt } from "@/lib/actions/invoices";
import { ReceiptPageClient } from "@/components/receipt/receipt-page-client";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getInvoiceForReceipt(id);
  if (!data) notFound();

  return <ReceiptPageClient data={data} />;
}
