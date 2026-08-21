"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { compositionKey, type AliasMap } from "@/lib/composition";

/** The pharmacy's own salt spellings, ready to pass to the matcher. */
export async function loadAliases(tenantId: string): Promise<AliasMap> {
  const rows = await prisma.saltAlias.findMany({
    where: { tenantId },
    select: { alias: true, canonical: true },
  });
  return new Map(rows.map((r) => [r.alias, r.canonical]));
}

export type CompositionIssue = {
  itemId: string;
  name: string;
  composition: string | null;
  reason: "missing" | "unreadable";
};

export type CompositionHealth = {
  total: number;
  usable: number;
  issues: CompositionIssue[];
  /// Compositions that do parse, grouped — how many items share each, so
  /// the owner can see substitution actually working.
  groups: { key: string; composition: string; itemNames: string[] }[];
};

/**
 * Which items can take part in substitution, and which cannot.
 *
 * Substitution is only as good as the composition data behind it, and that
 * data arrives however the supplier wrote it — often with no strengths at
 * all, which is unusable for matching. This is the list of what to fix,
 * with the format that works.
 */
export async function getCompositionHealth(): Promise<CompositionHealth> {
  const session = await requireSession();
  const tenantId = session.user.tenantId;
  const aliases = await loadAliases(tenantId);

  const items = await prisma.item.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, composition: true },
    orderBy: { name: "asc" },
  });

  const issues: CompositionIssue[] = [];
  const byKey = new Map<string, { composition: string; itemNames: string[] }>();

  for (const item of items) {
    const key = compositionKey(item.composition, aliases);
    if (!key) {
      issues.push({
        itemId: item.id,
        name: item.name,
        composition: item.composition,
        // A composition that is present but unreadable is a different
        // problem from one that was never entered: the first needs
        // rewriting, the second needs looking up.
        reason: item.composition?.trim() ? "unreadable" : "missing",
      });
      continue;
    }
    const existing = byKey.get(key);
    if (existing) existing.itemNames.push(item.name);
    else byKey.set(key, { composition: item.composition ?? "", itemNames: [item.name] });
  }

  const groups = [...byKey.entries()]
    .map(([key, v]) => ({ key, ...v }))
    // Only groups with more than one item mean anything for substitution.
    .filter((g) => g.itemNames.length > 1)
    .sort((a, b) => b.itemNames.length - a.itemNames.length);

  return { total: items.length, usable: items.length - issues.length, issues, groups };
}

export async function listSaltAliases() {
  const session = await requireSession();
  return prisma.saltAlias.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { alias: "asc" },
    select: { id: true, alias: true, canonical: true },
  });
}

export async function addSaltAlias(alias: string, canonical: string) {
  const session = await requirePermission("items.manage");
  const a = alias.trim().toLowerCase();
  const c = canonical.trim().toLowerCase();
  if (!a || !c) throw new Error("Both spellings are required.");
  if (a === c) throw new Error("Those are the same spelling.");

  const existing = await prisma.saltAlias.findFirst({
    where: { tenantId: session.user.tenantId, alias: a },
  });
  if (existing) throw new Error(`"${a}" is already treated as "${existing.canonical}".`);

  const row = await prisma.saltAlias.create({
    data: { tenantId: session.user.tenantId, alias: a, canonical: c },
  });

  // Auditable because it changes which medicines the app will offer as
  // substitutes for one another.
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "salt_alias.create",
    entity: "SaltAlias",
    entityId: row.id,
    after: { alias: a, canonical: c },
  });

  revalidatePath("/items/composition");
  revalidatePath("/pos");
  return row;
}

export async function removeSaltAlias(id: string) {
  const session = await requirePermission("items.manage");
  const row = await prisma.saltAlias.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!row) throw new Error("That alias no longer exists.");

  await prisma.saltAlias.delete({ where: { id } });
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "salt_alias.delete",
    entity: "SaltAlias",
    entityId: id,
    before: { alias: row.alias, canonical: row.canonical },
  });

  revalidatePath("/items/composition");
  revalidatePath("/pos");
}
