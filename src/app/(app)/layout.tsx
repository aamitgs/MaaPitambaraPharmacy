import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSelectedBranch } from "@/lib/branch-scope";
import { AppShell } from "@/components/app-shell";
import { listNotes } from "@/lib/actions/notes";
import { getBranding } from "@/lib/branding";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mfaSetupRequired) redirect("/mfa-setup");

  const [branding, branchScope, cookieStore, notes] = await Promise.all([
    getBranding(),
    resolveSelectedBranch(session.user.tenantId, session.user.role),
    cookies(),
    listNotes(),
  ]);

  // Read server-side so a collapsed rail renders collapsed on first paint
  // instead of flashing open on every navigation.
  const collapsed = cookieStore.get("sidebar-collapsed")?.value === "1";

  return (
    <AppShell
      user={{
        name: session.user.name ?? "User",
        role: session.user.role,
        pharmacyName: branding.name,
      }}
      logo={branding.logo}
      notes={notes}
      branchScope={branchScope}
      defaultCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
