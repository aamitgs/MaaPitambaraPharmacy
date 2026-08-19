"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { SELECTED_BRANCH_COOKIE, ALL_BRANCHES } from "@/lib/branch-constants";

export async function setSelectedBranch(branchId: string) {
  const session = await requireSession();

  if (branchId === ALL_BRANCHES) {
    if (session.user.role !== "owner") {
      throw new Error("Only Owner can view all branches");
    }
  } else {
    const belongs = await prisma.branch.findFirst({
      where: { id: branchId, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!belongs) throw new Error("Invalid branch");
  }

  const store = await cookies();
  store.set(SELECTED_BRANCH_COOKIE, branchId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
