"use server";

import { requirePermission } from "@/lib/rbac";
import { computeReceivables } from "@/lib/receivables-summary";

export async function getReceivables() {
  const session = await requirePermission("customers.manage");
  return computeReceivables(session.user.tenantId);
}
