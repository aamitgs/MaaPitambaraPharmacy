import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getGrn } from "@/lib/actions/grn";
import { GrnDetailClient } from "@/components/purchasing/grn-detail-client";

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;

  const { id } = await params;
  const grn = await getGrn(id);
  if (!grn) notFound();

  const canEdit = session.user.role === "owner" || session.user.role === "pharmacist";
  return <GrnDetailClient grn={grn} canEdit={canEdit} />;
}
