import "server-only";
import { prisma } from "@/lib/prisma";
import { rateOn } from "./resolve";

/**
 * Slabs for a picker: name plus the rate in force today.
 *
 * Separate from `listTaxSlabs` because that one is gated on
 * `compliance.manage` — someone who may edit an item's details should be
 * able to see which slab it is on without also being allowed to change
 * what any slab costs.
 */
export async function listPickableTaxSlabs(tenantId: string) {
  const slabs = await prisma.taxSlab.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { rates: true },
  });
  const now = new Date();
  return slabs.map((s) => {
    const current = rateOn(
      s.rates.map((r) => ({ rate: Number(r.rate), effectiveFrom: r.effectiveFrom })),
      now
    );
    return { id: s.id, name: s.name, currentRate: current ? current.rate : null };
  });
}
