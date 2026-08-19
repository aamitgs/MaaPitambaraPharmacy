import { ShieldAlert } from "lucide-react";

/**
 * Unlike the rest of the app (where every role can view a list/detail page
 * and only mutations are role-gated), compliance reports are restricted to
 * Owner/Pharmacist at the view level too — this is what a page renders
 * instead when a Counter Staff session lands here directly.
 */
export function RestrictedAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
      <ShieldAlert className="h-8 w-8" />
      <p className="text-sm font-medium text-foreground">Restricted to Owner and Pharmacist</p>
      <p className="text-sm">This compliance report isn&apos;t available to Counter Staff accounts.</p>
    </div>
  );
}
