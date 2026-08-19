"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { serializeItem, serializeBatch } from "@/lib/serialize";
import { getBranchFilter, resolveConcreteBranch } from "@/lib/branch-scope";

const scheduleClassEnum = z.enum(["none", "H", "H1", "X", "G"]);

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  genericName: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  composition: z.string().trim().optional(),
  scheduleClass: scheduleClassEnum,
  hsnCode: z.string().trim().optional(),
  taxRate: z.coerce.number().min(0).max(100),
  unit: z.string().trim().min(1),
  packSize: z.string().trim().optional(),
  reorderLevel: z.coerce.number().int().min(0),
  // Relative path returned by /api/uploads/item-photo. Nullable so the
  // form can clear an existing photo, not just replace it.
  imageUrl: z.string().nullish(),
});

export type ItemInput = z.infer<typeof itemSchema>;

const batchSchema = z.object({
  itemId: z.string().min(1),
  batchNo: z.string().trim().min(1, "Batch number is required"),
  mfgDate: z.string().optional(),
  expiryDate: z.string().min(1, "Expiry date is required"),
  mrp: z.coerce.number().positive(),
  purchaseRate: z.coerce.number().min(0),
  saleRate: z.coerce.number().positive(),
  currentQty: z.coerce.number().int().min(0),
  rackLocation: z.string().trim().optional(),
});

export type BatchInput = z.infer<typeof batchSchema>;

export async function listItems() {
  const session = await requireSession();
  const [tenant, branchFilter] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
    getBranchFilter(session.user.tenantId, session.user.role),
  ]);

  const items = await prisma.item.findMany({
    where: { tenantId: session.user.tenantId },
    include: { batches: { where: branchFilter } },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const nearExpiryCutoff = new Date(now.getTime() + tenant.nearExpiryWindowDays * 86400000);

  return items.map((item) => {
    const totalQty = item.batches.reduce((sum, b) => sum + b.currentQty, 0);
    const hasExpired = item.batches.some((b) => b.currentQty > 0 && b.expiryDate < now);
    const hasNearExpiry = item.batches.some(
      (b) => b.currentQty > 0 && b.expiryDate >= now && b.expiryDate <= nearExpiryCutoff
    );
    return {
      ...serializeItem(item),
      batches: item.batches.map(serializeBatch),
      totalQty,
      lowStock: totalQty < item.reorderLevel,
      outOfStock: totalQty === 0,
      hasExpired,
      hasNearExpiry,
    };
  });
}

export async function getItem(id: string) {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const item = await prisma.item.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      batches: { where: branchFilter, orderBy: { expiryDate: "asc" }, include: { branch: { select: { name: true } } } },
    },
  });
  if (!item) return null;
  return {
    ...serializeItem(item),
    batches: item.batches.map((b) => ({ ...serializeBatch(b), branchName: b.branch.name })),
  };
}

export async function createItem(input: ItemInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = itemSchema.parse(input);

  const item = await prisma.item.create({
    data: { ...parsed, tenantId: session.user.tenantId },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "item.create",
    entity: "Item",
    entityId: item.id,
    after: parsed,
  });

  revalidatePath("/items");
  return serializeItem(item);
}

export async function updateItem(id: string, input: ItemInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = itemSchema.parse(input);

  const before = await prisma.item.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!before) throw new Error("Item not found");

  const item = await prisma.item.update({
    where: { id },
    data: parsed,
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "item.update",
    entity: "Item",
    entityId: item.id,
    before,
    after: parsed,
  });

  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  return serializeItem(item);
}

export async function createBatch(input: BatchInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = batchSchema.parse(input);

  const item = await prisma.item.findFirst({
    where: { id: parsed.itemId, tenantId: session.user.tenantId },
  });
  if (!item) throw new Error("Item not found");

  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this pharmacy yet.");

  const batch = await prisma.batch.create({
    data: {
      itemId: parsed.itemId,
      branchId,
      batchNo: parsed.batchNo,
      mfgDate: parsed.mfgDate ? new Date(parsed.mfgDate) : null,
      expiryDate: new Date(parsed.expiryDate),
      mrp: parsed.mrp,
      purchaseRate: parsed.purchaseRate,
      saleRate: parsed.saleRate,
      currentQty: parsed.currentQty,
      rackLocation: parsed.rackLocation,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "batch.create",
    entity: "Batch",
    entityId: batch.id,
    after: parsed,
  });

  revalidatePath(`/items/${parsed.itemId}`);
  revalidatePath("/items");
  return serializeBatch(batch);
}

export async function updateBatch(id: string, input: BatchInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = batchSchema.parse(input);

  const before = await prisma.batch.findFirst({
    where: { id, item: { tenantId: session.user.tenantId } },
  });
  if (!before) throw new Error("Batch not found");

  const batch = await prisma.batch.update({
    where: { id },
    data: {
      batchNo: parsed.batchNo,
      mfgDate: parsed.mfgDate ? new Date(parsed.mfgDate) : null,
      expiryDate: new Date(parsed.expiryDate),
      mrp: parsed.mrp,
      purchaseRate: parsed.purchaseRate,
      saleRate: parsed.saleRate,
      currentQty: parsed.currentQty,
      rackLocation: parsed.rackLocation,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "batch.update",
    entity: "Batch",
    entityId: batch.id,
    before,
    after: parsed,
  });

  revalidatePath(`/items/${parsed.itemId}`);
  revalidatePath("/items");
  return serializeBatch(batch);
}
