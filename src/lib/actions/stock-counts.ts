"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { resolveConcreteBranch } from "@/lib/branch-scope";

/**
 * Physical stocktake.
 *
 * Opening a count freezes the system quantity per batch, so the target does
 * not move while someone walks the shelves. Posting it adjusts each batch
 * to what was counted — but measured against stock *at posting time*, not
 * against the frozen figure, because a 24×7 counter keeps selling during a
 * count. Lines where those two disagree are surfaced rather than quietly
 * reconciled, because that difference is a sale (fine) or a second person
 * also adjusting stock (not fine).
 *
 * The correction posts through the same StockAdjustment machinery as a
 * write-off, with reason `recount`, so the stock ledger has one story about
 * why quantities moved rather than two.
 */

async function nextCountNo(tenantId: string) {
  const prefix = `CNT-${new Date().toISOString().slice(0, 7).replace("-", "")}`;
  const last = await prisma.stockCount.findFirst({
    where: { tenantId, countNo: { startsWith: prefix } },
    orderBy: { countNo: "desc" },
    select: { countNo: true },
  });
  const n = last ? Number(last.countNo.split("-").pop()) + 1 : 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

const openSchema = z.object({
  note: z.string().trim().max(300).optional(),
  /** Empty means every batch in stock at this branch. */
  itemIds: z.array(z.string()).optional(),
  /** Include batches already at zero, to catch stock that exists but isn't recorded. */
  includeZeroQty: z.boolean().default(false),
});

export async function openStockCount(input: z.infer<typeof openSchema>) {
  const session = await requirePermission("stock.adjust");
  const tenantId = session.user.tenantId;
  const parsed = openSchema.parse(input);
  const branchId = await resolveConcreteBranch(tenantId, session.user.role);

  const existing = await prisma.stockCount.findFirst({
    where: { tenantId, branchId, status: "in_progress" },
    select: { id: true, countNo: true },
  });
  if (existing) {
    // Two open counts at one branch would each freeze a different snapshot
    // and then fight over the same batches when posted.
    throw new Error(
      `${existing.countNo} is still open at this branch. Finish or cancel it before starting another.`
    );
  }

  const batches = await prisma.batch.findMany({
    where: {
      branchId,
      item: { tenantId },
      ...(parsed.itemIds?.length ? { itemId: { in: parsed.itemIds } } : {}),
      ...(parsed.includeZeroQty ? {} : { currentQty: { gt: 0 } }),
    },
    select: { id: true, itemId: true, currentQty: true, purchaseRate: true },
  });

  if (batches.length === 0) throw new Error("There is nothing to count at this branch");

  const countNo = await nextCountNo(tenantId);
  const count = await prisma.stockCount.create({
    data: {
      tenantId,
      branchId,
      countNo,
      note: parsed.note || null,
      startedByUserId: session.user.id,
      lines: {
        create: batches.map((b) => ({
          itemId: b.itemId,
          batchId: b.id,
          expectedQty: b.currentQty,
          unitCost: b.purchaseRate,
        })),
      },
    },
  });

  revalidatePath("/stock-counts");
  return { id: count.id, countNo, lineCount: batches.length };
}

const saveSchema = z.object({
  countId: z.string().min(1),
  counts: z.array(z.object({ lineId: z.string().min(1), countedQty: z.coerce.number().int().min(0) })),
});

/** Saves progress without posting — a big count is not done in one sitting. */
export async function saveStockCountProgress(input: z.infer<typeof saveSchema>) {
  const session = await requirePermission("stock.adjust");
  const parsed = saveSchema.parse(input);

  const count = await prisma.stockCount.findFirst({
    where: { id: parsed.countId, tenantId: session.user.tenantId },
    select: { id: true, status: true },
  });
  if (!count) throw new Error("Count not found");
  if (count.status !== "in_progress") throw new Error("That count is already closed");

  await prisma.$transaction(
    parsed.counts.map((c) =>
      prisma.stockCountLine.update({
        where: { id: c.lineId },
        data: { countedQty: c.countedQty },
      })
    )
  );

  revalidatePath(`/stock-counts/${parsed.countId}`);
  return { saved: parsed.counts.length };
}

export async function getStockCount(id: string) {
  const session = await requirePermission("stock.adjust");
  const count = await prisma.stockCount.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      startedBy: { select: { name: true } },
      completedBy: { select: { name: true } },
      branch: { select: { name: true } },
      lines: {
        include: {
          item: { select: { name: true, unit: true } },
          batch: { select: { batchNo: true, expiryDate: true, currentQty: true } },
        },
        orderBy: [{ item: { name: "asc" } }],
      },
    },
  });
  if (!count) return null;

  return {
    id: count.id,
    countNo: count.countNo,
    status: count.status,
    note: count.note,
    branchName: count.branch.name,
    startedAt: count.startedAt.toISOString(),
    startedByName: count.startedBy.name,
    completedAt: count.completedAt?.toISOString() ?? null,
    completedByName: count.completedBy?.name ?? null,
    adjustmentId: count.adjustmentId,
    lines: count.lines.map((l) => ({
      id: l.id,
      itemName: l.item.name,
      unit: l.item.unit,
      batchNo: l.batch.batchNo,
      expiryDate: l.batch.expiryDate.toISOString(),
      expectedQty: l.expectedQty,
      countedQty: l.countedQty,
      /** Live stock now — differs from expected if trade continued. */
      currentQty: l.batch.currentQty,
      unitCost: Number(l.unitCost),
    })),
  };
}

export async function listStockCounts() {
  const session = await requirePermission("stock.adjust");
  const rows = await prisma.stockCount.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      startedBy: { select: { name: true } },
      branch: { select: { name: true } },
      _count: { select: { lines: true } },
      lines: { select: { countedQty: true, expectedQty: true, unitCost: true } },
    },
  });

  return rows.map((r) => {
    const counted = r.lines.filter((l) => l.countedQty !== null);
    const variance = counted.reduce(
      (sum, l) => sum + ((l.countedQty ?? 0) - l.expectedQty) * Number(l.unitCost),
      0
    );
    return {
      id: r.id,
      countNo: r.countNo,
      status: r.status,
      branchName: r.branch.name,
      startedAt: r.startedAt.toISOString(),
      startedByName: r.startedBy.name,
      lineCount: r._count.lines,
      countedCount: counted.length,
      varianceValue: Math.round(variance * 100) / 100,
    };
  });
}

const postSchema = z.object({
  countId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export async function postStockCount(input: z.infer<typeof postSchema>) {
  const session = await requirePermission("stock.adjust");
  const tenantId = session.user.tenantId;
  const parsed = postSchema.parse(input);

  const count = await prisma.stockCount.findFirst({
    where: { id: parsed.countId, tenantId },
    include: { lines: { include: { batch: { select: { currentQty: true } } } } },
  });
  if (!count) throw new Error("Count not found");
  if (count.status !== "in_progress") throw new Error("That count is already closed");

  const uncounted = count.lines.filter((l) => l.countedQty === null);
  if (uncounted.length > 0) {
    throw new Error(
      `${uncounted.length} batch${uncounted.length === 1 ? " has" : "es have"} not been counted yet. ` +
        `Enter a figure for every line — a blank is not the same as zero.`
    );
  }

  // Adjust to the counted figure from wherever stock stands NOW. Using the
  // frozen expectation instead would re-apply sales made during the count.
  const corrections = count.lines
    .map((l) => ({
      line: l,
      delta: (l.countedQty ?? 0) - l.batch.currentQty,
      /** Movement between opening the count and posting it. */
      drift: l.batch.currentQty - l.expectedQty,
    }))
    .filter((c) => c.delta !== 0);

  const adjustmentNo = await (async () => {
    const prefix = `ADJ-${new Date().toISOString().slice(0, 7).replace("-", "")}`;
    const last = await prisma.stockAdjustment.findFirst({
      where: { tenantId, adjustmentNo: { startsWith: prefix } },
      orderBy: { adjustmentNo: "desc" },
      select: { adjustmentNo: true },
    });
    const n = last ? Number(last.adjustmentNo.split("-").pop()) + 1 : 1;
    return `${prefix}-${String(n).padStart(4, "0")}`;
  })();

  const result = await prisma.$transaction(async (tx) => {
    let adjustmentId: string | null = null;

    if (corrections.length > 0) {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          tenantId,
          branchId: count.branchId,
          adjustmentNo,
          reason: "recount",
          note: parsed.note
            ? `${count.countNo}: ${parsed.note}`
            : `Posted from stocktake ${count.countNo}`,
          adjustedByUserId: session.user.id,
          items: {
            create: corrections.map((c) => ({
              itemId: c.line.itemId,
              batchId: c.line.batchId,
              qtyChange: c.delta,
              unitCost: c.line.unitCost,
            })),
          },
        },
      });
      adjustmentId = adjustment.id;

      for (const c of corrections) {
        await tx.batch.update({
          where: { id: c.line.batchId },
          data: { currentQty: { increment: c.delta } },
        });
      }
    }

    await tx.stockCount.update({
      where: { id: count.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        completedByUserId: session.user.id,
        adjustmentId,
      },
    });

    return { adjustmentId };
  });

  // Two different numbers, and conflating them is how a stocktake starts
  // lying. `correctionValue` is what this posting actually moved.
  // `discrepancyValue` is what the count found against what the system
  // believed when the count opened — the shrinkage figure. They differ by
  // exactly the trade that happened during the count.
  const correctionValue = corrections.reduce(
    (sum, c) => sum + c.delta * Number(c.line.unitCost),
    0
  );
  const discrepancyValue = count.lines.reduce(
    (sum, l) => sum + ((l.countedQty ?? 0) - l.expectedQty) * Number(l.unitCost),
    0
  );
  const drifted = count.lines.filter((l) => l.batch.currentQty !== l.expectedQty).length;

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "stockCount.post",
    entity: "StockCount",
    entityId: count.id,
    after: {
      countNo: count.countNo,
      linesCounted: count.lines.length,
      linesCorrected: corrections.length,
      correctionValue: Math.round(correctionValue * 100) / 100,
      discrepancyValue: Math.round(discrepancyValue * 100) / 100,
      linesThatMovedDuringCount: drifted,
      adjustmentNo: result.adjustmentId ? adjustmentNo : null,
    },
  });

  revalidatePath("/stock-counts");
  revalidatePath("/stock-adjustments");
  revalidatePath("/items");
  return {
    corrections: corrections.length,
    correctionValue: Math.round(correctionValue * 100) / 100,
    discrepancyValue: Math.round(discrepancyValue * 100) / 100,
    drifted,
  };
}

export async function cancelStockCount(id: string) {
  const session = await requirePermission("stock.adjust");
  const count = await prisma.stockCount.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, status: true, countNo: true },
  });
  if (!count) throw new Error("Count not found");
  if (count.status !== "in_progress") throw new Error("That count is already closed");

  await prisma.stockCount.update({ where: { id }, data: { status: "cancelled" } });
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "stockCount.cancel",
    entity: "StockCount",
    entityId: id,
    after: { countNo: count.countNo },
  });
  revalidatePath("/stock-counts");
  return { ok: true as const };
}
