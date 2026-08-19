import { notFound } from "next/navigation";
import { getPurchaseReturn } from "@/lib/actions/purchase-returns";
import { PurchaseReturnDetailClient } from "@/components/purchasing/purchase-return-detail-client";

export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ret = await getPurchaseReturn(id);
  if (!ret) notFound();

  return <PurchaseReturnDetailClient ret={ret} />;
}
