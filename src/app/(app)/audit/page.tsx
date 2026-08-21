import { ShieldAlert } from "lucide-react";
import { auth } from "@/auth";
import { listAuditLog, getAuditLogFacets } from "@/lib/actions/audit-log";
import { AuditLogView } from "@/components/audit/audit-log-view";

export default async function AuditPage() {
  const session = await auth();
  if (!session?.user) return null;

  if (session.user.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Owner only</p>
        <p className="text-sm">
          The audit log records what staff did, so only the owner can read it.
        </p>
      </div>
    );
  }

  const [first, facets] = await Promise.all([listAuditLog({}), getAuditLogFacets()]);
  return (
    <AuditLogView initialRows={first.rows} initialCursor={first.nextCursor} facets={facets} />
  );
}
