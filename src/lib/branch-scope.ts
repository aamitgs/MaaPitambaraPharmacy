import "server-only";
import { cookies } from "next/headers";
import type { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { SELECTED_BRANCH_COOKIE, ALL_BRANCHES } from "@/lib/branch-constants";

export interface BranchOption {
  id: string;
  name: string;
}

export interface SelectedBranch {
  branchId: string | null;
  isAllBranches: boolean;
  branches: BranchOption[];
}

/**
 * Resolves the "current branch" server-side scoping for the signed-in
 * user's tenant. Falls back to the tenant's first branch if the cookie is
 * unset or references a branch that isn't this tenant's (e.g. stale after
 * switching accounts, or a tenant that had a branch deleted). "all" is only
 * honored for Owner — every other role always gets a concrete branch back,
 * since POS and most day-to-day screens need exactly one to operate on.
 */
export async function resolveSelectedBranch(tenantId: string, role: UserRole): Promise<SelectedBranch> {
  const branches = await prisma.branch.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (branches.length === 0) return { branchId: null, isAllBranches: false, branches };

  const store = await cookies();
  const raw = store.get(SELECTED_BRANCH_COOKIE)?.value;

  if (raw === ALL_BRANCHES && role === "owner") {
    return { branchId: null, isAllBranches: true, branches };
  }

  const match = branches.find((b) => b.id === raw);
  if (match) return { branchId: match.id, isAllBranches: false, branches };

  return { branchId: branches[0].id, isAllBranches: false, branches };
}

/** Same resolution, but always returns a concrete branch — for screens like POS that can't operate in "all branches" mode. */
export async function resolveConcreteBranch(tenantId: string, role: UserRole) {
  const selected = await resolveSelectedBranch(tenantId, role);
  return selected.branchId ?? selected.branches[0]?.id ?? null;
}

/**
 * Spreadable Prisma where-clause fragment for branch-scoping a query:
 * `where: { tenantId, ...(await getBranchFilter(tenantId, role)) }`.
 * Empty object when viewing "all branches" (Owner only). When the tenant
 * has no branch at all, filters on an id no real branch can ever have,
 * rather than throwing — an empty list is the correct result there, not
 * an error, matching how the rest of the app treats a branch-less tenant.
 */
export async function getBranchFilter(tenantId: string, role: UserRole): Promise<{ branchId: string } | Record<string, never>> {
  const { branchId, isAllBranches } = await resolveSelectedBranch(tenantId, role);
  if (isAllBranches) return {};
  return { branchId: branchId ?? "no-branch-configured" };
}
