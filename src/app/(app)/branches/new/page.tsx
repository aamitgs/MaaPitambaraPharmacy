import { auth } from "@/auth";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { BranchForm } from "@/components/branches/branch-form";

export default async function NewBranchPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "owner") return <RestrictedAccess />;

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">New branch</h1>
      <BranchForm />
    </div>
  );
}
