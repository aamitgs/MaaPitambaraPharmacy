"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

/**
 * Settings that were previously only reachable by editing the database.
 * Owner-only: each one loosens or tightens a control the counter works
 * under, so they are not something a staff role should be able to grant
 * itself.
 */
export type SellingSettings = {
  nearExpiryWindowDays: number;
  wholesaleBillingEnabled: boolean;
  offlineSyncMaxHours: number;
};

export async function getSellingSettings(): Promise<SellingSettings> {
  const session = await requireSession();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.user.tenantId },
  });

  return {
    nearExpiryWindowDays: tenant.nearExpiryWindowDays,
    wholesaleBillingEnabled: tenant.wholesaleBillingEnabled,
    offlineSyncMaxHours: tenant.offlineSyncMaxHours,
  };
}

/**
 * What is left on this tab after two moves: the authority controls
 * (discount cap, return window, manager PIN) went to Staff & roles behind
 * password + OTP step-up, and the bill header/footer/terms went to
 * /branding alongside the logo and colours. Stock housekeeping is all that
 * genuinely belongs in Settings.
 */
const schema = z.object({
  nearExpiryWindowDays: z.coerce.number().int().min(0).max(365),
  wholesaleBillingEnabled: z.boolean().default(false),
  // At least an hour, so a slow reconnection is never treated as stale;
  // at most a week, past which a queued bill certainly needs looking at.
  offlineSyncMaxHours: z.coerce.number().int().min(1).max(168),
});

export async function updateSellingSettings(input: z.infer<typeof schema>) {
  const session = await requireRole(["owner"]);
  const parsed = schema.parse(input);

  const before = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.user.tenantId },
    select: {
      nearExpiryWindowDays: true,
      wholesaleBillingEnabled: true,
      offlineSyncMaxHours: true,
    },
  });

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      nearExpiryWindowDays: parsed.nearExpiryWindowDays,
      wholesaleBillingEnabled: parsed.wholesaleBillingEnabled,
      offlineSyncMaxHours: parsed.offlineSyncMaxHours,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "settings.selling.update",
    entity: "Tenant",
    entityId: session.user.tenantId,
    before: {
      nearExpiryWindowDays: before.nearExpiryWindowDays,
      wholesaleBillingEnabled: before.wholesaleBillingEnabled,
    },
    after: {
      nearExpiryWindowDays: parsed.nearExpiryWindowDays,
      wholesaleBillingEnabled: parsed.wholesaleBillingEnabled,
      offlineSyncMaxHours: parsed.offlineSyncMaxHours,
    },
  });

  revalidatePath("/settings");
  // The alerts screen reads the near-expiry window.
  revalidatePath("/alerts");
  revalidatePath("/pos");
}
