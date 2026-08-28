import "server-only";
import { prisma } from "@/lib/prisma";
import type { AliasMap } from "@/lib/composition";

/**
 * The pharmacy's own salt spellings, ready to pass to the matcher.
 *
 * Deliberately not a Server Action: it takes tenantId as a bare argument
 * with no session check of its own, trusting the caller (another action
 * that has already authenticated) to have derived it from a real session.
 * Living outside any "use server" file means it can never be exposed as a
 * directly callable endpoint, however it's imported in the future.
 */
export async function loadAliases(tenantId: string): Promise<AliasMap> {
  const rows = await prisma.saltAlias.findMany({
    where: { tenantId },
    select: { alias: true, canonical: true },
  });
  return new Map(rows.map((r) => [r.alias, r.canonical]));
}
