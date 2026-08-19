"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

/**
 * Just the tenant-wide license renewal window now — per-branch license
 * numbers/expiry dates moved to src/lib/actions/branches.ts in Phase 4,
 * since a tenant can have more than one branch and each branch owns its
 * own compliance profile. This setting stays tenant-level because it's a
 * single "how far ahead should Alerts warn me" preference, not something
 * that varies per branch.
 */
export async function getLicenseExpiryWindow() {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  return { licenseExpiryWindowDays: tenant.licenseExpiryWindowDays };
}

const updateSchema = z.object({
  licenseExpiryWindowDays: z.coerce.number().int().positive(),
});

export async function updateLicenseExpiryWindow(input: z.infer<typeof updateSchema>) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = updateSchema.parse(input);

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { licenseExpiryWindowDays: parsed.licenseExpiryWindowDays },
  });

  revalidatePath("/settings");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}
