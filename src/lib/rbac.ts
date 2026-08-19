import "server-only";
import type { UserRole } from "@/generated/prisma/client";
import { auth } from "@/auth";

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
