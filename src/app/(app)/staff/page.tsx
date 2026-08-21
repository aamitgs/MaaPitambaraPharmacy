import { ShieldAlert } from "lucide-react";
import { auth } from "@/auth";
import { getCounterLimits, listRoles, listStaff } from "@/lib/actions/staff";
import { StaffManager } from "@/components/staff/staff-manager";

/**
 * Staff administration. Owner-only at the view level as well as in every
 * action — this is the screen that hands out access, so it is not something
 * a custom role can be granted.
 */
export default async function StaffPage() {
  const session = await auth();
  if (!session?.user) return null;

  if (session.user.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <p className="text-sm font-medium text-foreground">Owner only</p>
        <p className="text-sm">
          Staff accounts and roles can only be managed by the pharmacy owner.
        </p>
      </div>
    );
  }

  const [staff, roles, counterLimits] = await Promise.all([
    listStaff(),
    listRoles(),
    getCounterLimits(),
  ]);
  return <StaffManager staff={staff} roles={roles} counterLimits={counterLimits} />;
}
