import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { canManageCompliance } from "@/lib/rbac";
import { getBranch } from "@/lib/actions/branches";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { BranchForm } from "@/components/branches/branch-form";

export default async function EditBranchPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  if (!canManageCompliance(session.user.role)) return <RestrictedAccess />;

  const { id } = await params;
  const branch = await getBranch(id);
  if (!branch) notFound();

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">{branch.name}</h1>
      <BranchForm branch={branch} />
    </div>
  );
}
