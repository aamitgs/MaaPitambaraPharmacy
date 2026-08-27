import "server-only";
import type { UserRole } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  SYSTEM_ROLE_PERMISSIONS,
  type Permission,
} from "@/lib/permissions";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError("Not signed in");
  return session;
}

/** Server-side RBAC gate. Never rely on hiding UI alone. */
export async function requireRole(allowed: UserRole[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    throw new UnauthorizedError(`Requires role: ${allowed.join(", ")}`);
  }
  return session;
}

export const canViewPurchaseRate = (role: UserRole) => role === "owner" || role === "pharmacist";
export const canEditItemMaster = (role: UserRole) => role === "owner" || role === "pharmacist";
export const canManageUsers = (role: UserRole) => role === "owner";
export const canCancelInvoice = (role: UserRole) => role === "owner" || role === "pharmacist";
export const canManageCompliance = (role: UserRole) => role === "owner" || role === "pharmacist";
// Deleting a customer or supplier record is narrower than editing one:
// counter staff can add and edit customers day-to-day (customers.manage),
// but removing a record outright wants the same second pair of eyes as
// writing off stock — so this stays owner/pharmacist regardless of what
// customers.manage itself grants.
export const canDeleteRecords = (role: UserRole) => role === "owner" || role === "pharmacist";

/**
 * Fine-grained gate, replacing the role-list checks. Two deliberate
 * properties:
 *
 * - **An owner always passes.** Custom roles are editable, and an owner who
 *   could edit themselves out of user management would be locked out of
 *   their own pharmacy with no way back in.
 * - **Unknown or missing role ⇒ the shipped defaults for that role.** A user
 *   with no custom role behaves exactly as before this existed, so nothing
 *   silently opens up.
 */
export async function getPermissions(): Promise<Set<Permission>> {
  const session = await requireSession();
  if (session.user.role === "owner") {
    return new Set(SYSTEM_ROLE_PERMISSIONS.owner);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { roleRef: { select: { permissions: true } } },
  });

  const granted = user?.roleRef?.permissions;
  if (!granted) return new Set(SYSTEM_ROLE_PERMISSIONS[session.user.role]);
  return new Set(granted as Permission[]);
}

export async function hasPermission(permission: Permission) {
  return (await getPermissions()).has(permission);
}

/** Throws UnauthorizedError unless the signed-in user holds `permission`. */
export async function requirePermission(permission: Permission) {
  const session = await requireSession();
  if (session.user.role === "owner") return session;

  if (!(await hasPermission(permission))) {
    throw new UnauthorizedError(`Requires permission: ${permission}`);
  }
  return session;
}
