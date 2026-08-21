"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import { compositionKey } from "@/lib/composition";
import { loadAliases } from "@/lib/actions/composition-health";
import { isBatchExpired } from "@/lib/expiry";

export type SubstituteOption = {
  itemId: string;
  name: string;
  manufacturer: string | null;
  composition: string | null;
  scheduleClass: string;
  /// Sellable packs across every non-expired batch at this branch.
  inStock: number;
  /// Cheapest sellable rate, which is what the counter quotes.
  rate: number;
  mrp: number;
};

export type SubstituteResult = {
  /// The item the counter was looking for, if it was recognised.
  soughtName: string;
  soughtComposition: string | null;
  /// Why there is nothing to offer, when there isn't.
  note: string | null;
  options: SubstituteOption[];
};

/**
 * "Do you have anything else for this?"
 *
 * Answered against composition, never brand. Only items actually on the
 * shelf and not expired are offered — a substitute the counter cannot hand
 * over is worse than no answer, because it sends them looking.
 *
 * Strength is matched exactly. Paracetamol 500mg is not an answer to
 * Paracetamol 650mg, and this will say it has nothing rather than offer
 * one for the other.
 */
export async function findSubstitutes(itemId: string): Promise<SubstituteResult> {
  const session = await requireSession();
  const tenantId = session.user.tenantId;
  const branchFilter = await getBranchFilter(tenantId, session.user.role);
  // The pharmacy's own salt spellings, so a local decision about what
  // counts as the same ingredient is honoured here too.
  const aliases = await loadAliases(tenantId);

  const sought = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true, name: true, composition: true },
  });
  if (!sought) return { soughtName: "", soughtComposition: null, note: "Item not found.", options: [] };

  const key = compositionKey(sought.composition, aliases);
  if (!key) {
    return {
      soughtName: sought.name,
      soughtComposition: sought.composition,
      note: sought.composition
        ? `The composition recorded for ${sought.name} has no strengths, so it cannot be matched ` +
          `safely. Write it as "Paracetamol 500mg + Caffeine 30mg" and substitutes will appear.`
        : `No composition is recorded for ${sought.name}, so there is nothing to match against. ` +
          `Add one on the item and substitutes will appear.`,
      options: [],
    };
  }

  // Candidates are narrowed in the database to active items that have some
  // stock; composition is then matched in code, because the comparison is
  // a parse rather than a string equality and cannot be expressed in SQL.
  const candidates = await prisma.item.findMany({
    where: {
      tenantId,
      isActive: true,
      id: { not: itemId },
      composition: { not: null },
      batches: { some: { ...branchFilter, currentQty: { gt: 0 } } },
    },
    select: {
      id: true,
      name: true,
      manufacturer: true,
      composition: true,
      scheduleClass: true,
      batches: {
        where: { ...branchFilter, currentQty: { gt: 0 } },
        select: { currentQty: true, saleRate: true, mrp: true, expiryDate: true },
      },
    },
  });

  const options: SubstituteOption[] = [];
  for (const c of candidates) {
    if (compositionKey(c.composition, aliases) !== key) continue;

    const sellable = c.batches.filter((b) => !isBatchExpired(b.expiryDate));
    if (sellable.length === 0) continue;

    const inStock = sellable.reduce((sum, b) => sum + b.currentQty, 0);
    const rate = Math.min(...sellable.map((b) => Number(b.saleRate)));
    const mrp = Math.min(...sellable.map((b) => Number(b.mrp)));

    options.push({
      itemId: c.id,
      name: c.name,
      manufacturer: c.manufacturer,
      composition: c.composition,
      scheduleClass: c.scheduleClass,
      inStock,
      rate,
      mrp,
    });
  }

  // Cheapest first: the reason a customer accepts a substitute is usually
  // price, and it is the number the counter will be asked for.
  options.sort((a, b) => a.rate - b.rate);

  return {
    soughtName: sought.name,
    soughtComposition: sought.composition,
    note:
      options.length === 0
        ? `Nothing else in stock has the same composition as ${sought.name}.`
        : null,
    options,
  };
}

/**
 * The counter's actual path in: they typed a name, the picker showed
 * nothing, and the question is whether that medicine exists at all and
 * what can stand in for it.
 */
export async function findSubstitutesByName(query: string): Promise<SubstituteResult | null> {
  const session = await requireSession();
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  // Deliberately includes out-of-stock and retired items: this runs when
  // the picker found nothing, and "we stock it, it's finished" is itself
  // the answer the counter needs.
  const match = await prisma.item.findFirst({
    where: {
      tenantId: session.user.tenantId,
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { genericName: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (!match) return null;

  return findSubstitutes(match.id);
}
