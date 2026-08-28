import "server-only";
import { prisma } from "@/lib/prisma";
import type { SlabLookup } from "./resolve";

/**
 * Everything the resolver needs, loaded once.
 *
 * Deliberately not a Server Action: it takes tenantId as a bare argument
 * with no session check of its own, trusting the caller (another action
 * that has already authenticated) to have derived it from a real session.
 * Living outside any "use server" file means it can never be exposed as a
 * directly callable endpoint, however it's imported in the future.
 */
export async function loadTaxContext(tenantId: string) {
  const [slabs, mappings] = await Promise.all([
    prisma.taxSlab.findMany({
      where: { tenantId, isActive: true },
      include: { rates: true },
    }),
    prisma.hsnTaxMapping.findMany({ where: { tenantId } }),
  ]);

  const slabsById = new Map<string, SlabLookup>(
    slabs.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        rates: s.rates.map((r) => ({ rate: Number(r.rate), effectiveFrom: r.effectiveFrom })),
      },
    ])
  );
  const hsnToSlabId = new Map(mappings.map((m) => [m.hsnCode, m.slabId]));
  return { slabsById, hsnToSlabId };
}
