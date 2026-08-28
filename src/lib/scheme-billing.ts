import "server-only";
import { prisma } from "@/lib/prisma";
import type { SchemeDef } from "@/lib/scheme-engine";

/**
 * Active, in-date schemes only — what the POS billing screen auto-applies
 * against the cart.
 *
 * Deliberately not a Server Action: it takes tenantId as a bare argument
 * with no session check of its own, trusting the caller (another action
 * that has already authenticated) to have derived it from a real session.
 * Living outside any "use server" file means it can never be exposed as a
 * directly callable endpoint, however it's imported in the future.
 */
export async function listActiveSchemesForBilling(tenantId: string): Promise<SchemeDef[]> {
  const now = new Date();
  const schemes = await prisma.scheme.findMany({
    where: { tenantId, active: true, validFrom: { lte: now }, validTo: { gte: now } },
  });
  return schemes.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type as "percent_off" | "buy_x_get_y",
    config: s.config as SchemeDef["config"],
  }));
}
