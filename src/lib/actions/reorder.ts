"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { getBranchFilter, resolveConcreteBranch } from "@/lib/branch-scope";
import { suggestReorderQty, DEFAULT_COVER_DAYS } from "@/lib/reorder";
import { compositionKey } from "@/lib/composition";
import { loadAliases } from "@/lib/actions/composition-health";

/**
 * What to buy, and from whom.
 *
 * `reorderLevel` previously drove nothing but a count on the alerts screen;
 * turning that into an order still meant reading the list and typing a PO
 * by hand. This groups the shortfall by the supplier each item was last
 * bought from, so the output is one draft PO per supplier rather than a
 * shopping list.
 */

const WINDOW_DAYS = 60;

export type ReorderLine = {
  itemId: string;
  itemName: string;
  unit: string;
  packSize: string | null;
  currentQty: number;
  reorderLevel: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  suggestedQty: number;
  basis: string;
  lastRate: number | null;
  supplierId: string | null;
  supplierName: string | null;
  /// Other brands of the same composition that are already on the shelf.
  /// Reordering something you effectively already have is a real way for
  /// working capital to end up sitting in a drawer.
  alternativesInStock: { name: string; qty: number }[];
};

export type ReorderGroup = {
  supplierId: string | null;
  supplierName: string;
  lines: ReorderLine[];
  estimatedValue: number;
};

export async function getReorderSuggestions(): Promise<ReorderGroup[]> {
  const session = await requirePermission("purchasing.manage");
  const tenantId = session.user.tenantId;
  const branchFilter = await getBranchFilter(tenantId, session.user.role);

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

  const items = await prisma.item.findMany({
    where: { tenantId, isActive: true },
    include: { batches: { where: branchFilter } },
    orderBy: { name: "asc" },
  });

  const belowLevel = items
    .map((item) => ({
      item,
      currentQty: item.batches.reduce((sum, b) => sum + b.currentQty, 0),
    }))
    .filter(({ item, currentQty }) => currentQty < item.reorderLevel);

  if (belowLevel.length === 0) return [];

  const itemIds = belowLevel.map(({ item }) => item.id);

  const [sold, recentGrnItems] = await Promise.all([
    // Sales velocity over the window. Cancelled bills are excluded, so a
    // double-ring that was voided does not inflate what gets ordered.
    prisma.salesInvoiceItem.groupBy({
      by: ["itemId"],
      where: {
        itemId: { in: itemIds },
        invoice: {
          tenantId,
          ...branchFilter,
          status: "completed",
          invoiceDate: { gte: windowStart },
        },
      },
      _sum: { qty: true },
    }),
    prisma.grnItem.findMany({
      where: { itemId: { in: itemIds }, grn: { tenantId, ...branchFilter } },
      orderBy: { grn: { receivedAt: "desc" } },
      include: { grn: { include: { supplier: { select: { id: true, name: true } } } } },
    }),
  ]);

  const soldByItem = new Map(sold.map((s) => [s.itemId, s._sum.qty ?? 0]));

  // First hit wins because the query is ordered newest-first: the supplier
  // who last actually delivered this item is the one to ask again.
  const lastPurchase = new Map<string, { rate: number; supplierId: string; supplierName: string }>();
  for (const gi of recentGrnItems) {
    if (!lastPurchase.has(gi.itemId)) {
      lastPurchase.set(gi.itemId, {
        rate: Number(gi.rate),
        supplierId: gi.grn.supplier.id,
        supplierName: gi.grn.supplier.name,
      });
    }
  }

  // Composition is compared once for every item in the catalogue, not per
  // suggestion — the alternative is an N×M parse on every page load.
  const aliases = await loadAliases(tenantId);
  const stockByKey = new Map<string, { name: string; qty: number }[]>();
  for (const item of items) {
    const key = compositionKey(item.composition, aliases);
    if (!key) continue;
    const qty = item.batches.reduce((sum, b) => sum + b.currentQty, 0);
    if (qty <= 0) continue;
    stockByKey.set(key, [...(stockByKey.get(key) ?? []), { name: item.name, qty }]);
  }

  const lines: ReorderLine[] = [];
  for (const { item, currentQty } of belowLevel) {
    const suggestion = suggestReorderQty({
      currentQty,
      reorderLevel: item.reorderLevel,
      soldInWindow: soldByItem.get(item.id) ?? 0,
      windowDays: WINDOW_DAYS,
      coverDays: DEFAULT_COVER_DAYS,
    });
    if (suggestion.suggestedQty <= 0) continue;

    const last = lastPurchase.get(item.id) ?? null;
    const key = compositionKey(item.composition, aliases);
    const alternativesInStock = key
      ? (stockByKey.get(key) ?? []).filter((a) => a.name !== item.name)
      : [];
    lines.push({
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      packSize: item.packSize,
      currentQty,
      reorderLevel: item.reorderLevel,
      dailyVelocity: suggestion.dailyVelocity,
      daysOfCover: suggestion.daysOfCover,
      suggestedQty: suggestion.suggestedQty,
      basis: suggestion.basis,
      lastRate: last?.rate ?? null,
      supplierId: last?.supplierId ?? null,
      supplierName: last?.supplierName ?? null,
      alternativesInStock,
    });
  }

  const groups = new Map<string, ReorderGroup>();
  for (const line of lines) {
    // Items never purchased through a GRN have no supplier to infer; they
    // are grouped apart rather than guessed at.
    const key = line.supplierId ?? "__none__";
    const group = groups.get(key) ?? {
      supplierId: line.supplierId,
      supplierName: line.supplierName ?? "No previous supplier",
      lines: [],
      estimatedValue: 0,
    };
    group.lines.push(line);
    group.estimatedValue += (line.lastRate ?? 0) * line.suggestedQty;
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((g) => ({ ...g, estimatedValue: Math.round(g.estimatedValue * 100) / 100 }))
    .sort((a, b) => b.estimatedValue - a.estimatedValue);
}

const createSchema = z.object({
  supplierId: z.string().min(1, "Pick a supplier for this order"),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.coerce.number().int().positive(),
        rate: z.coerce.number().nonnegative(),
      })
    )
    .min(1, "Add at least one item"),
});

/**
 * Creates a *draft* PO, never a sent one. The suggestion is arithmetic; the
 * decision to spend the money stays with a person, who can still edit the
 * order before sending it.
 */
export async function createPurchaseOrderFromSuggestions(
  input: z.infer<typeof createSchema>
) {
  const session = await requirePermission("purchasing.manage");
  const tenantId = session.user.tenantId;
  const parsed = createSchema.parse(input);
  const branchId = await resolveConcreteBranch(tenantId, session.user.role);

  const supplier = await prisma.supplier.findFirst({
    where: { id: parsed.supplierId, tenantId },
    select: { id: true, name: true },
  });
  if (!supplier) throw new Error("Supplier not found");

  const itemIds = [...new Set(parsed.items.map((i) => i.itemId))];
  const ownedItemCount = await prisma.item.count({
    where: { id: { in: itemIds }, tenantId },
  });
  if (ownedItemCount !== itemIds.length) {
    throw new Error("One of the items in this purchase order was not found");
  }

  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      branchId,
      supplierId: supplier.id,
      status: "draft",
      createdByUserId: session.user.id,
      items: {
        create: parsed.items.map((i) => ({ itemId: i.itemId, qty: i.qty, rate: i.rate })),
      },
    },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "purchaseOrder.createFromSuggestions",
    entity: "PurchaseOrder",
    entityId: po.id,
    after: {
      supplier: supplier.name,
      lines: parsed.items.length,
      estimatedValue:
        Math.round(parsed.items.reduce((s, i) => s + i.qty * i.rate, 0) * 100) / 100,
    },
  });

  revalidatePath("/purchase-orders");
  revalidatePath("/alerts");
  return { id: po.id, supplierName: supplier.name };
}
