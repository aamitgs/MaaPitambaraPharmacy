"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { serializePurchaseOrderItem, serializeSupplier } from "@/lib/serialize";
import { getBranchFilter, resolveConcreteBranch } from "@/lib/branch-scope";

const poItemSchema = z.object({
  itemId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  rate: z.coerce.number().min(0),
});

const poSchema = z.object({
  supplierId: z.string().min(1, "Select a supplier"),
  // Relative path returned by /api/uploads/purchase-invoice.
  documentImagePath: z.string().optional(),
  items: z.array(poItemSchema).min(1, "Add at least one item"),
});

export type PurchaseOrderInput = z.infer<typeof poSchema>;

export async function listPurchaseOrders() {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId: session.user.tenantId, ...branchFilter },
    include: { supplier: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  return orders.map((po) => ({
    id: po.id,
    status: po.status,
    createdAt: po.createdAt,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    itemCount: po.items.length,
    total: po.items.reduce((sum, i) => sum + i.qty * Number(i.rate), 0),
  }));
}

export async function getPurchaseOrder(id: string) {
  const session = await requireSession();
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      supplier: true,
      items: { include: { item: true } },
      grns: { select: { id: true, receivedAt: true, supplierInvoiceNo: true } },
    },
  });
  if (!po) return null;
  return {
    id: po.id,
    status: po.status,
    documentImageUrl: po.documentImageUrl,
    createdAt: po.createdAt,
    supplier: serializeSupplier(po.supplier),
    grns: po.grns,
    items: po.items.map((i) => ({
      ...serializePurchaseOrderItem(i),
      itemName: i.item.name,
      unit: i.item.unit,
    })),
  };
}

/**
 * Purchase orders for a supplier that haven't already been received
 * against — for the GRN "link a PO" picker. `includePoId` always includes
 * that one PO regardless of status, so a GRN opened via a specific PO's
 * "Create GRN" link (e.g. a second partial receipt against an already-
 * `received` PO) always has its pre-filled selection appear as a real
 * option instead of silently falling back to "No PO" in the dropdown.
 */
export async function listOpenPurchaseOrdersForSupplier(supplierId: string, includePoId?: string) {
  const session = await requireSession();
  // Scoped to the branch a GRN would actually be received into — a PO
  // placed by another branch isn't something this GRN should link to.
  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: session.user.tenantId,
      branchId: branchId ?? undefined,
      supplierId,
      OR: [{ status: { in: ["draft", "sent"] } }, ...(includePoId ? [{ id: includePoId }] : [])],
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  return orders.map((po) => ({
    id: po.id,
    status: po.status,
    createdAt: po.createdAt,
    itemCount: po.items.length,
  }));
}

export async function createPurchaseOrder(input: PurchaseOrderInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = poSchema.parse(input);

  const supplier = await prisma.supplier.findFirst({
    where: { id: parsed.supplierId, tenantId: session.user.tenantId },
  });
  if (!supplier) throw new Error("Supplier not found");

  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this tenant");

  const itemIds = [...new Set(parsed.items.map((i) => i.itemId))];
  const ownedItemCount = await prisma.item.count({
    where: { id: { in: itemIds }, tenantId: session.user.tenantId },
  });
  if (ownedItemCount !== itemIds.length) {
    throw new Error("One of the items in this purchase order was not found");
  }

  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId: session.user.tenantId,
      branchId,
      supplierId: parsed.supplierId,
      documentImageUrl: parsed.documentImagePath || null,
      createdByUserId: session.user.id,
      items: {
        create: parsed.items.map((i) => ({ itemId: i.itemId, qty: i.qty, rate: i.rate })),
      },
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "purchase_order.create",
    entity: "PurchaseOrder",
    entityId: po.id,
    after: parsed,
  });

  revalidatePath("/purchase-orders");
  return { id: po.id };
}

const statusSchema = z.enum(["draft", "sent", "received", "cancelled"]);

export async function updatePurchaseOrderStatus(id: string, status: z.infer<typeof statusSchema>) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsedStatus = statusSchema.parse(status);

  const before = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!before) throw new Error("Purchase order not found");

  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: parsedStatus },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "purchase_order.status_change",
    entity: "PurchaseOrder",
    entityId: po.id,
    before: { status: before.status },
    after: { status: parsedStatus },
  });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
}
