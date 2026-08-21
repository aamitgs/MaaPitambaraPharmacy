"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { resolveConcreteBranch } from "@/lib/branch-scope";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Parking a sale so the counter is not blocked.
 *
 * The classic case is a customer who has gone to fetch their prescription
 * or their wallet: without this, the person behind them waits, or the cart
 * gets cleared and rebuilt from memory.
 *
 * Nothing here touches stock. A hold is not a sale, so the items stay
 * available to anyone else — including the till that is about to sell the
 * last box of them, which is the correct outcome even though it means a
 * resumed hold can find an item gone.
 */

const holdSchema = z.object({
  label: z.string().trim().min(1, "Give the hold a name you'll recognise").max(60),
  cart: z.unknown(),
  itemCount: z.coerce.number().int().nonnegative(),
  estimatedTotal: z.coerce.number().nonnegative(),
});

export type HeldSaleSummary = {
  id: string;
  label: string;
  itemCount: number;
  estimatedTotal: number;
  heldByName: string;
  createdAt: string;
};

export async function holdSale(input: z.infer<typeof holdSchema>) {
  const session = await requirePermission("sales.sell");
  const tenantId = session.user.tenantId;
  const parsed = holdSchema.parse(input);
  const branchId = await resolveConcreteBranch(tenantId, session.user.role);

  const held = await prisma.heldSale.create({
    data: {
      tenantId,
      branchId,
      label: parsed.label,
      cart: parsed.cart as Prisma.InputJsonValue,
      itemCount: parsed.itemCount,
      estimatedTotal: parsed.estimatedTotal,
      heldByUserId: session.user.id,
    },
  });

  revalidatePath("/pos");
  return { id: held.id };
}

export async function listHeldSales(): Promise<HeldSaleSummary[]> {
  const session = await requirePermission("sales.sell");
  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);

  const rows = await prisma.heldSale.findMany({
    where: { tenantId: session.user.tenantId, branchId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { heldBy: { select: { name: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    itemCount: r.itemCount,
    estimatedTotal: Number(r.estimatedTotal),
    heldByName: r.heldBy.name,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Hands the cart back and removes the hold in one step — a hold that is
 * resumed but left behind is how the same sale gets rung up twice.
 */
export async function resumeHeldSale(id: string) {
  const session = await requirePermission("sales.sell");
  const held = await prisma.heldSale.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!held) throw new Error("That held sale is no longer there — someone may have resumed it");

  await prisma.heldSale.delete({ where: { id } });
  revalidatePath("/pos");
  return { cart: held.cart, label: held.label };
}

export async function discardHeldSale(id: string) {
  const session = await requirePermission("sales.sell");
  const held = await prisma.heldSale.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!held) return { ok: true as const };

  await prisma.heldSale.delete({ where: { id } });
  revalidatePath("/pos");
  return { ok: true as const };
}
