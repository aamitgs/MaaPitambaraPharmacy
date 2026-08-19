import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveConcreteBranch } from "@/lib/branch-scope";
import { TransferRequestForm } from "@/components/transfers/transfer-request-form";

export default async function NewTransferPage() {
  const session = await auth();
  if (!session?.user) return null;

  const currentBranchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  const branches = await prisma.branch.findMany({
    where: { tenantId: session.user.tenantId, id: { not: currentBranchId ?? undefined } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Request stock transfer</h1>
        <p className="text-sm text-muted-foreground">
          Requests stock into your currently selected branch from another branch.
        </p>
      </div>
      {branches.length ? (
        <TransferRequestForm branches={branches} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No other branches to request stock from yet.
        </p>
      )}
    </div>
  );
}
