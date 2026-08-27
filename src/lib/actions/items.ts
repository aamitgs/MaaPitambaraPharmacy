"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { serializeItem, serializeBatch } from "@/lib/serialize";
import { getBranchFilter, resolveConcreteBranch } from "@/lib/branch-scope";
import { buildInternalBarcode } from "@/lib/barcode/internal-code";

const scheduleClassEnum = z.enum(["none", "H", "H1", "X", "G"]);

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  genericName: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  // Empty string from the <select> means "no preferred supplier set".
  supplierId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  composition: z.string().trim().optional(),
  scheduleClass: scheduleClassEnum,
  hsnCode: z.string().trim().optional(),
  // Normalised to null when blank: "" would collide with another blank
  // item under the per-tenant unique index, where NULLs coexist freely.
  barcode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
  taxRate: z.coerce.number().min(0).max(100),
  // Empty string from the <select> means "resolve from HSN".
  taxSlabId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  unit: z.string().trim().min(1),
  packSize: z.string().trim().optional(),
  unitsPerPack: z.coerce.number().int().min(1).max(1000).default(1),
  allowLooseSale: z.boolean().default(false),
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
  // Three states, and they mean different things: absent leaves the stored
  // PTR alone (the field is not rendered for staff who may not see it),
  // null clears it, a number sets it.
  ptr: z
    .union([z.literal(""), z.null(), z.coerce.number().positive()])
    .optional()
    .transform((v) => (v === "" ? null : v)),
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
    include: {
      batches: { where: branchFilter },
      supplier: { select: { name: true } },
    },
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
      supplierName: item.supplier?.name ?? null,
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
      batches: {
        where: branchFilter,
        orderBy: [{ rackLocation: { sort: "asc", nulls: "last" } }, { expiryDate: "asc" }],
        include: { branch: { select: { name: true } } },
      },
    },
  });
  if (!item) return null;
  return {
    ...serializeItem(item),
    batches: item.batches.map((b) => ({ ...serializeBatch(b), branchName: b.branch.name })),
  };
}

/**
 * Turns the unique-barcode violation into something a counter can act on.
 * The raw Prisma message names the index, which tells staff nothing about
 * which pack is already using the code.
 */
async function assertBarcodeFree(tenantId: string, barcode: string | undefined, excludeId?: string) {
  if (!barcode) return;
  const clash = await prisma.item.findFirst({
    where: { tenantId, barcode, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { name: true },
  });
  if (clash) {
    throw new Error(`That barcode is already on "${clash.name}".`);
  }
}

export async function createItem(input: ItemInput) {
  const session = await requirePermission("items.manage");
  const parsed = itemSchema.parse(input);
  await assertBarcodeFree(session.user.tenantId, parsed.barcode);

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
  const session = await requirePermission("items.manage");
  const parsed = itemSchema.parse(input);

  const before = await prisma.item.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!before) throw new Error("Item not found");
  await assertBarcodeFree(session.user.tenantId, parsed.barcode, id);

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

export async function deleteItem(id: string) {
  const session = await requirePermission("items.manage");

  const before = await prisma.item.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!before) throw new Error("Item not found");

  // Retiring (setItemActive) is for an item with real history — stock that
  // still has to be found, invoices that still have to make sense. Delete
  // is the other case: an item that was never actually used, most often one
  // that arrived via a bulk import and turned out unwanted. Every relation
  // below is checked rather than just "batches", because a purchase order
  // line can name an item before any batch of it has ever been received.
  const [
    batches,
    salesLines,
    poLines,
    grnLines,
    purchaseReturnLines,
    salesReturnLines,
    transferLines,
    adjustmentLines,
    countLines,
    narcoticEntries,
  ] = await Promise.all([
    prisma.batch.count({ where: { itemId: id } }),
    prisma.salesInvoiceItem.count({ where: { itemId: id } }),
    prisma.purchaseOrderItem.count({ where: { itemId: id } }),
    prisma.grnItem.count({ where: { itemId: id } }),
    prisma.purchaseReturnItem.count({ where: { itemId: id } }),
    prisma.salesReturnItem.count({ where: { itemId: id } }),
    prisma.stockTransferItem.count({ where: { itemId: id } }),
    prisma.stockAdjustmentItem.count({ where: { itemId: id } }),
    prisma.stockCountLine.count({ where: { itemId: id } }),
    prisma.narcoticRegisterEntry.count({ where: { itemId: id } }),
  ]);
  const inUse =
    batches +
    salesLines +
    poLines +
    grnLines +
    purchaseReturnLines +
    salesReturnLines +
    transferLines +
    adjustmentLines +
    countLines +
    narcoticEntries;
  if (inUse > 0) {
    throw new Error(
      `${before.name} has ${inUse} linked record${inUse === 1 ? "" : "s"} (batches, orders, invoices, transfers or counts) and cannot be deleted. Retire it instead.`
    );
  }

  await prisma.item.delete({ where: { id } });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "item.delete",
    entity: "Item",
    entityId: id,
    before,
  });

  revalidatePath("/items");
}

export async function createBatch(input: BatchInput) {
  const session = await requirePermission("items.manage");
  const parsed = batchSchema.parse(input);

  const item = await prisma.item.findFirst({
    where: { id: parsed.itemId, tenantId: session.user.tenantId },
  });
  if (!item) throw new Error("Item not found");

  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this pharmacy yet.");

  // PTR is what a wholesale buyer pays. Setting it is as commercially
  // consequential as billing at it, so it carries the same permission.
  const mayPricePtr = await hasPermission("sales.wholesale");
  if (parsed.ptr != null && !mayPricePtr) {
    throw new Error("You are not allowed to set wholesale prices (PTR).");
  }

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
      ptr: mayPricePtr ? (parsed.ptr ?? null) : null,
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
  const session = await requirePermission("items.manage");
  const parsed = batchSchema.parse(input);

  const before = await prisma.batch.findFirst({
    where: { id, item: { tenantId: session.user.tenantId } },
  });
  if (!before) throw new Error("Batch not found");

  // Undefined means the form never rendered the field, so the stored PTR is
  // left exactly as it was rather than being quietly wiped. Submitting the
  // value it already holds is not a change and needs no permission.
  const mayPricePtr = await hasPermission("sales.wholesale");
  const currentPtr = before.ptr === null ? null : Number(before.ptr);
  if (parsed.ptr !== undefined && parsed.ptr !== currentPtr && !mayPricePtr) {
    throw new Error("You are not allowed to change wholesale prices (PTR).");
  }

  const batch = await prisma.batch.update({
    where: { id },
    data: {
      batchNo: parsed.batchNo,
      mfgDate: parsed.mfgDate ? new Date(parsed.mfgDate) : null,
      expiryDate: new Date(parsed.expiryDate),
      mrp: parsed.mrp,
      purchaseRate: parsed.purchaseRate,
      saleRate: parsed.saleRate,
      ptr: mayPricePtr ? parsed.ptr : undefined,
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

/**
 * Retire an item, or bring it back.
 *
 * Never a delete: the item is referenced by every invoice line that ever
 * sold it, by the GST returns already filed, and by the batches still on
 * the shelf. Retiring hides it from the counter and from reordering while
 * leaving all of that intact — expiry alerts included, because stock that
 * is no longer sold is exactly the stock that gets forgotten.
 */
export async function setItemActive(id: string, isActive: boolean) {
  const session = await requirePermission("items.manage");

  const before = await prisma.item.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, name: true, isActive: true },
  });
  if (!before) throw new Error("Item not found");

  const item = await prisma.item.update({ where: { id }, data: { isActive } });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: isActive ? "item.restore" : "item.retire",
    entity: "Item",
    entityId: id,
    before: { isActive: before.isActive },
    after: { isActive },
  });

  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  return serializeItem(item);
}

/**
 * How much stock is still sitting under a retired item — the number the
 * pharmacist needs before retiring one, because it does not disappear.
 */
export async function getItemStockOnHand(id: string) {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const batches = await prisma.batch.findMany({
    where: { itemId: id, item: { tenantId: session.user.tenantId }, ...branchFilter },
    select: { currentQty: true },
  });
  return batches.reduce((sum, b) => sum + b.currentQty, 0);
}

/**
 * Issues an internal barcode for an item that arrived without one — loose
 * strips, repacked bottles, anything the distributor did not label.
 *
 * Never overwrites a barcode that is already there: if the pack has a
 * printed code, that code is the one on the shelf, and replacing it in the
 * database would leave every existing pack unscannable.
 */
export async function assignInternalBarcode(itemId: string) {
  const session = await requirePermission("items.manage");

  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId: session.user.tenantId },
    select: { id: true, name: true, barcode: true },
  });
  if (!item) throw new Error("Item not found");
  if (item.barcode) {
    throw new Error(
      `${item.name} already has the barcode ${item.barcode}. Clear it on the item first if it is wrong.`
    );
  }

  // Randomised codes clash about as often as two cuids do, but the unique
  // index is per tenant and the cost of getting it wrong is two items
  // scanning as one another, so retry rather than assume.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = buildInternalBarcode();
    const clash = await prisma.item.findFirst({
      where: { tenantId: session.user.tenantId, barcode: candidate },
      select: { id: true },
    });
    if (clash) continue;

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: { barcode: candidate },
    });
    await writeAuditLog({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "item.barcode.assign",
      entity: "Item",
      entityId: itemId,
      after: { barcode: candidate },
    });
    revalidatePath(`/items/${itemId}`);
    revalidatePath("/items");
    return serializeItem(updated);
  }

  throw new Error("Could not generate a free barcode. Try again.");
}
