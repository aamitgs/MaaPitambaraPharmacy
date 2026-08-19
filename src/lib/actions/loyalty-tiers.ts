"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

function serializeTier(t: { id: string; name: string; minCumulativeSpend: unknown; discountPercent: unknown }) {
  return {
    id: t.id,
    name: t.name,
    minCumulativeSpend: Number(t.minCumulativeSpend),
    discountPercent: Number(t.discountPercent),
  };
}

export async function listLoyaltyTiers() {
  const session = await requireRole(["owner", "pharmacist"]);
  const tiers = await prisma.loyaltyTier.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { minCumulativeSpend: "asc" },
  });
  return tiers.map(serializeTier);
}

const tierSchema = z.object({
  name: z.string().trim().min(1, "Tier name is required"),
  minCumulativeSpend: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100),
});

export type LoyaltyTierInput = z.infer<typeof tierSchema>;

export async function createLoyaltyTier(input: LoyaltyTierInput) {
  const session = await requireRole(["owner"]);
  const parsed = tierSchema.parse(input);

  const tier = await prisma.loyaltyTier.create({
    data: { tenantId: session.user.tenantId, ...parsed },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "loyaltyTier.create",
    entity: "LoyaltyTier",
    entityId: tier.id,
    after: parsed,
  });

  revalidatePath("/loyalty-tiers");
  return { id: tier.id };
}

export async function updateLoyaltyTier(tierId: string, input: LoyaltyTierInput) {
  const session = await requireRole(["owner"]);
  const parsed = tierSchema.parse(input);

  const tier = await prisma.loyaltyTier.findFirst({
    where: { id: tierId, tenantId: session.user.tenantId },
  });
  if (!tier) throw new Error("Loyalty tier not found");

  await prisma.loyaltyTier.update({ where: { id: tier.id }, data: parsed });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "loyaltyTier.update",
    entity: "LoyaltyTier",
    entityId: tier.id,
    after: parsed,
  });

  revalidatePath("/loyalty-tiers");
}

export async function deleteLoyaltyTier(tierId: string) {
  const session = await requireRole(["owner"]);
  const tier = await prisma.loyaltyTier.findFirst({
    where: { id: tierId, tenantId: session.user.tenantId },
  });
  if (!tier) throw new Error("Loyalty tier not found");

  // Customers referencing this tier fall back to no tier rather than
  // blocking the delete — resolveLoyaltyTier will reassign them on their
  // next completed sale.
  await prisma.customer.updateMany({ where: { loyaltyTierId: tier.id }, data: { loyaltyTierId: null } });
  await prisma.loyaltyTier.delete({ where: { id: tier.id } });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "loyaltyTier.delete",
    entity: "LoyaltyTier",
    entityId: tier.id,
  });

  revalidatePath("/loyalty-tiers");
}
