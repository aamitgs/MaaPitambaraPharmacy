import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveSelectedBranch } from "@/lib/branch-scope";
import { AppShell } from "@/components/app-shell";
import { BRAND } from "@/lib/brand";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mfaSetupRequired) redirect("/mfa-setup");

  const [tenant, branchScope] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId } }),
    resolveSelectedBranch(session.user.tenantId, session.user.role),
  ]);

  return (
    <AppShell
      user={{
        name: session.user.name ?? "User",
        role: session.user.role,
        pharmacyName: tenant?.pharmacyName ?? BRAND.name,
      }}
      branchScope={branchScope}
    >
      {children}
    </AppShell>
  );
}
