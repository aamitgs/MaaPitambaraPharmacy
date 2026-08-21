"use server";

import { nextDocumentNumber } from "@/lib/document-number";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { resolveConcreteBranch } from "@/lib/branch-scope";
import type { StockAdjustmentReason } from "@/generated/prisma/client";

/**
 * Stock that leaves — or joins — the books without a sale or a purchase.
 *
 * Insert-only by design: a wrong adjustment is corrected with a second,
 * opposite one rather than by editing the first. Stock records are the
 * thing an inspector reads, and a row that can be rewritten proves nothing.
 */

const itemSchema = z.object({
  batchId: z.string().min(1),
  /** Signed. Negative writes stock off; positive puts it back. */
  qtyChange: z.coerce.number().int().refine((n) => n !== 0, "Enter a quantity"),
});

const schema = z.object({
  reason: z.enum(["expired", "damaged", "lost", "found", "sample", "recount"]),
  note: z.string().trim().max(500).optional(),
  disposalRef: z.string().trim().max(120).optional(),
  items: z.array(itemSchema).min(1, "Add at least one batch"),
});

export type StockAdjustmentInput = z.infer<typeof schema>;

export async function createStockAdjustment(input: StockAdjustmentInput) {
  const session = await requirePermission("stock.adjust");
  const tenantId = session.user.tenantId;
  const parsed = schema.parse(input);
  const branchId = await resolveConcreteBranch(tenantId, session.user.role);

  // Expired stock that has been destroyed needs its disposal reference:
  // "we wrote it off" and "we destroyed it and here is the record" are
  // different claims, and only the second one satisfies an inspection.
  if (parsed.reason === "expired" && !parsed.disposalRef) {
    throw new Error(
      "Record the destruction/disposal reference for expired stock — it is what proves the stock was destroyed rather than diverted."
    );
  }

  const batches = await prisma.batch.findMany({
    where: {
      id: { in: parsed.items.map((i) => i.batchId) },
      branchId,
      item: { tenantId },
    },
    include: { item: { select: { id: true, name: true } } },
  });
  const byId = new Map(batches.map((b) => [b.id, b]));

  for (const line of parsed.items) {
    const batch = byId.get(line.batchId);
    if (!batch) throw new Error("One of those batches is not stocked at this branch");
    if (line.qtyChange < 0 && batch.currentQty < Math.abs(line.qtyChange)) {
      throw new Error(
        `${batch.item.name} batch ${batch.batchNo} has only ${batch.currentQty} in stock — cannot write off ${Math.abs(line.qtyChange)}.`
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    // Allocated inside the transaction: outside it, two adjustments posted
    // together would be handed the same number.
    const adjustmentNo = await nextDocumentNumber(tx, tenantId, "ADJ");

    const adjustment = await tx.stockAdjustment.create({
      data: {
        tenantId,
        branchId,
        adjustmentNo,
        reason: parsed.reason as StockAdjustmentReason,
        note: parsed.note || null,
        disposalRef: parsed.disposalRef || null,
        adjustedByUserId: session.user.id,
        items: {
          create: parsed.items.map((line) => {
            const batch = byId.get(line.batchId)!;
            return {
              itemId: batch.item.id,
              batchId: line.batchId,
              qtyChange: line.qtyChange,
              unitCost: batch.purchaseRate,
            };
          }),
        },
      },
    });

    for (const line of parsed.items) {
      await tx.batch.update({
        where: { id: line.batchId },
        data: { currentQty: { increment: line.qtyChange } },
      });
    }

    return adjustment;
  });

  const value = parsed.items.reduce((sum, line) => {
    const batch = byId.get(line.batchId)!;
    return sum + Math.abs(line.qtyChange) * Number(batch.purchaseRate);
  }, 0);

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "stock.adjust",
    entity: "StockAdjustment",
    entityId: created.id,
    after: {
      adjustmentNo: created.adjustmentNo,
      reason: parsed.reason,
      disposalRef: parsed.disposalRef ?? null,
      lines: parsed.items.length,
      valueAtCost: Math.round(value * 100) / 100,
    },
  });

  revalidatePath("/stock-adjustments");
  revalidatePath("/alerts");
  revalidatePath("/items");
  return { id: created.id, adjustmentNo: created.adjustmentNo };
}

export async function listStockAdjustments() {
  const session = await requirePermission("stock.adjust");
  const rows = await prisma.stockAdjustment.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { adjustedAt: "desc" },
    take: 200,
    include: {
      branch: { select: { name: true } },
      adjustedBy: { select: { name: true } },
      items: { include: { item: { select: { name: true } }, batch: { select: { batchNo: true } } } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    adjustmentNo: r.adjustmentNo,
    reason: r.reason,
    note: r.note,
    disposalRef: r.disposalRef,
    adjustedAt: r.adjustedAt.toISOString(),
    branchName: r.branch.name,
    byName: r.adjustedBy.name,
    lines: r.items.map((i) => ({
      itemName: i.item.name,
      batchNo: i.batch.batchNo,
      qtyChange: i.qtyChange,
      unitCost: Number(i.unitCost),
    })),
    totalQty: r.items.reduce((s, i) => s + i.qtyChange, 0),
    valueAtCost:
      Math.round(
        r.items.reduce((s, i) => s + Math.abs(i.qtyChange) * Number(i.unitCost), 0) * 100
      ) / 100,
  }));
}

/**
 * Batches that can be written off — everything in stock at this branch,
 * with the expired ones surfaced first since that is the common case.
 */
export async function listAdjustableBatches() {
  const session = await requirePermission("stock.adjust");
  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);

  const batches = await prisma.batch.findMany({
    where: { branchId, currentQty: { gt: 0 }, item: { tenantId: session.user.tenantId } },
    include: { item: { select: { name: true, unit: true } } },
    orderBy: [{ expiryDate: "asc" }],
    take: 1000,
  });

  const now = new Date();
  return batches.map((b) => ({
    id: b.id,
    itemName: b.item.name,
    unit: b.item.unit,
    batchNo: b.batchNo,
    expiryDate: b.expiryDate.toISOString(),
    isExpired: b.expiryDate < now,
    currentQty: b.currentQty,
    purchaseRate: Number(b.purchaseRate),
  }));
}
