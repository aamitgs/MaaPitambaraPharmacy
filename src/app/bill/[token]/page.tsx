import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/branding";
import { getInvoiceForPublicBill } from "@/lib/actions/public-bill";
import { ReceiptView } from "@/components/receipt/receipt-view";

export const metadata: Metadata = {
  title: "Your bill",
  // A bill link should never turn up in a search result.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The customer's copy. No session, because the recipient has no account —
 * the token is the credential. It shows exactly what is printed on the
 * paper bill they were handed and nothing more: no other invoice, no
 * balance, no way to navigate anywhere else in the app.
 */
export default async function PublicBillPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getInvoiceForPublicBill(token);
  if (!data) notFound();

  const branding = await getBranding();

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-[148mm]">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <ReceiptView data={data} layout="wide" />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {branding.name} · This is your copy of the bill. Keep the link to view it again.
        </p>
      </div>
    </main>
  );
}
