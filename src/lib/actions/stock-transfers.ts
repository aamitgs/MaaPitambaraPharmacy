"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { resolveConcreteBranch, resolveSelectedBranch } from "@/lib/branch-scope";
import { serializeItem, serializeBatch } from "@/lib/serialize";

/**
 * fromBranch is the source (fulfilling) branch; toBranch is the branch that
 * requested stock. Approval and the actual stock movement happen
 * atomically in the same action, so a transfer never rests in "approved" —
 * it goes straight from pending to completed (or rejected). See the
 * StockTransferStatus enum comment in schema.prisma.
 */
export async function listStockTransfers() {
  const session = await requireSession();
  const scope = await resolveSelectedBranch(session.user.tenantId, session.user.role);

  const transfers = await prisma.stockTransfer.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(scope.isAllBranches
        ? {}
        : { OR: [{ fromBranchId: scope.branchId ?? undefined }, { toBranchId: scope.branchId ?? undefined }] }),
    },
    include: {
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      items: { include: { item: { select: { name: true, unit: true } }, batch: { select: { batchNo: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return transfers.map((t) => ({
    id: t.id,
    fromBranchName: t.fromBranch.name,
    toBranchName: t.toBranch.name,
    fromBranchId: t.fromBranchId,
    toBranchId: t.toBranchId,
    status: t.status,
    requestedByName: t.requestedBy.name,
    approvedByName: t.approvedBy?.name ?? null,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    items: t.items.map((i) => ({
      itemName: i.item.name,
      unit: i.item.unit,
      batchNo: i.batch.batchNo,
      qty: i.qty,
    })),
  }));
}

/** Stock available at a specific branch (not necessarily the currently-selected one) — for the "request from" picker. */
export async function getBranchStock(branchId: string) {
  const session = await requireSession();
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: session.user.tenantId },
  });
  if (!branch) throw new Error("Branch not found");

  const items = await prisma.item.findMany({
    where: { tenantId: session.user.tenantId, batches: { some: { branchId, currentQty: { gt: 0 } } } },
    include: { batches: { where: { branchId, currentQty: { gt: 0 } }, orderBy: { expiryDate: "asc" } } },
    orderBy: { name: "asc" },
  });

  return items.map((item) => ({
    ...serializeItem(item),
    batches: item.batches.map(serializeBatch),
  }));
}

const transferItemSchema = z.object({
  itemId: z.string().min(1),
  batchId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
});

const createTransferSchema = z.object({
  fromBranchId: z.string().min(1, "Select a source branch"),
  items: z.array(transferItemSchema).min(1, "Add at least one item"),
});

export type CreateStockTransferInput = z.infer<typeof createTransferSchema>;

export async function createStockTransferRequest(input: CreateStockTransferInput) {
  const session = await requireSession();
  const parsed = createTransferSchema.parse(input);
  const tenantId = session.user.tenantId;

  const toBranchId = await resolveConcreteBranch(tenantId, session.user.role);
  if (!toBranchId) throw new Error("No branch configured for this pharmacy yet.");
  if (parsed.fromBranchId === toBranchId) {
    throw new Error("Source and destination branch must be different.");
  }

  const fromBranch = await prisma.branch.findFirst({
    where: { id: parsed.fromBranchId, tenantId },
  });
  if (!fromBranch) throw new Error("Source branch not found");

  const batchIds = parsed.items.map((i) => i.batchId);
  const batches = await prisma.batch.findMany({
    where: { id: { in: batchIds }, branchId: parsed.fromBranchId, item: { tenantId } },
  });
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  for (const row of parsed.items) {
    const batch = batchMap.get(row.batchId);
    if (!batch || batch.itemId !== row.itemId) {
      throw new Error("One of the selected batches is no longer available at the source branch.");
    }
    if (batch.currentQty < row.qty) {
      throw new Error(`Only ${batch.currentQty} unit(s) of batch ${batch.batchNo} available to request.`);
    }
  }

  const transfer = await prisma.stockTransfer.create({
    data: {
      tenantId,
      fromBranchId: parsed.fromBranchId,
      toBranchId,
      requestedByUserId: session.user.id,
      items: {
        create: parsed.items.map((row) => ({ itemId: row.itemId, batchId: row.batchId, qty: row.qty })),
      },
    },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "stock_transfer.request",
    entity: "StockTransfer",
    entityId: transfer.id,
    after: { fromBranchId: parsed.fromBranchId, toBranchId, itemCount: parsed.items.length },
  });

  revalidatePath("/transfers");
  return { id: transfer.id };
}

export async function approveStockTransfer(transferId: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;

  const transfer = await prisma.stockTransfer.findFirst({
    where: { id: transferId, tenantId },
    include: { items: { include: { batch: { include: { item: true } } } } },
  });
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.status !== "pending") throw new Error("This transfer has already been decided.");

  await prisma.$transaction(async (tx) => {
    for (const row of transfer.items) {
      const sourceBatch = await tx.batch.findFirst({
        where: { id: row.batchId, branchId: transfer.fromBranchId },
      });
      if (!sourceBatch || sourceBatch.currentQty < row.qty) {
        throw new Error(
          `Not enough stock left at the source branch for ${row.batch.item.name} (batch ${row.batch.batchNo}).`
        );
      }

      const decremented = await tx.batch.updateMany({
        where: { id: sourceBatch.id, currentQty: { gte: row.qty } },
        data: { currentQty: { decrement: row.qty } },
      });
      if (decremented.count === 0) {
        throw new Error(`Stock for ${row.batch.item.name} changed — please review and try again.`);
      }

      const destBatch = await tx.batch.findFirst({
        where: { branchId: transfer.toBranchId, itemId: sourceBatch.itemId, batchNo: sourceBatch.batchNo },
      });

      if (destBatch) {
        await tx.batch.update({
          where: { id: destBatch.id },
          data: { currentQty: { increment: row.qty } },
        });
      } else {
        await tx.batch.create({
          data: {
            itemId: sourceBatch.itemId,
            branchId: transfer.toBranchId,
            batchNo: sourceBatch.batchNo,
            mfgDate: sourceBatch.mfgDate,
            expiryDate: sourceBatch.expiryDate,
            mrp: sourceBatch.mrp,
            purchaseRate: sourceBatch.purchaseRate,
            saleRate: sourceBatch.saleRate,
            currentQty: row.qty,
          },
        });
      }
    }

    await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "completed", approvedByUserId: session.user.id, completedAt: new Date() },
    });
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "stock_transfer.approve",
    entity: "StockTransfer",
    entityId: transfer.id,
    before: { status: "pending" },
    after: { status: "completed", fromBranchId: transfer.fromBranchId, toBranchId: transfer.toBranchId },
  });

  revalidatePath("/transfers");
  revalidatePath("/items");
  revalidatePath("/pos");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function rejectStockTransfer(transferId: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;

  const transfer = await prisma.stockTransfer.findFirst({ where: { id: transferId, tenantId } });
  if (!transfer) throw new Error("Transfer not found");
  if (transfer.status !== "pending") throw new Error("This transfer has already been decided.");

  await prisma.stockTransfer.update({
    where: { id: transfer.id },
    data: { status: "rejected", approvedByUserId: session.user.id },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "stock_transfer.reject",
    entity: "StockTransfer",
    entityId: transfer.id,
    before: { status: "pending" },
    after: { status: "rejected" },
  });

  revalidatePath("/transfers");
}
