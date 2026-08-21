"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import {
  serializePurchaseReturnItem,
  serializeSupplier,
} from "@/lib/serialize";
import { getBranchFilter, resolveConcreteBranch } from "@/lib/branch-scope";

const returnItemSchema = z.object({
  itemId: z.string().min(1),
  batchId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  rate: z.coerce.number().min(0),
});

const returnSchema = z.object({
  supplierId: z.string().min(1, "Select a supplier"),
  grnId: z.string().optional(),
  reason: z.string().trim().optional(),
  items: z.array(returnItemSchema).min(1, "Add at least one item"),
});

export type PurchaseReturnInput = z.infer<typeof returnSchema>;

export async function listPurchaseReturns() {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const returns = await prisma.purchaseReturn.findMany({
    where: { tenantId: session.user.tenantId, ...branchFilter },
    include: { supplier: true, items: true },
    orderBy: { returnDate: "desc" },
  });
  return returns.map((r) => ({
    id: r.id,
    supplierName: r.supplier.name,
    returnDate: r.returnDate,
    reason: r.reason,
    itemCount: r.items.length,
    totalAmount: Number(r.totalAmount),
  }));
}

export async function getPurchaseReturn(id: string) {
  const session = await requireSession();
  const ret = await prisma.purchaseReturn.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      supplier: true,
      createdBy: { select: { name: true } },
      items: { include: { item: { select: { name: true, unit: true } }, batch: { select: { batchNo: true } } } },
    },
  });
  if (!ret) return null;

  return {
    id: ret.id,
    supplier: serializeSupplier(ret.supplier),
    grnId: ret.grnId,
    returnDate: ret.returnDate,
    reason: ret.reason,
    createdByName: ret.createdBy.name,
    totalAmount: Number(ret.totalAmount),
    items: ret.items.map((i) => ({
      ...serializePurchaseReturnItem(i),
      itemName: i.item.name,
      unit: i.item.unit,
      batchNo: i.batch.batchNo,
    })),
  };
}

export async function createPurchaseReturn(input: PurchaseReturnInput) {
  const session = await requirePermission("purchasing.manage");
  const parsed = returnSchema.parse(input);

  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this pharmacy yet.");

  const supplier = await prisma.supplier.findFirst({
    where: { id: parsed.supplierId, tenantId: session.user.tenantId },
  });
  if (!supplier) throw new Error("Supplier not found");

  if (parsed.grnId) {
    const grn = await prisma.grn.findFirst({
      where: { id: parsed.grnId, tenantId: session.user.tenantId, branchId },
    });
    if (!grn) throw new Error("GRN not found");
  }

  const totalAmount = parsed.items.reduce((sum, i) => sum + i.qty * i.rate, 0);

  const returnId = await prisma.$transaction(async (tx) => {
    for (const row of parsed.items) {
      // branchId scoped — a batch physically at another branch must never
      // be decremented by a return filed from this branch.
      const batch = await tx.batch.findFirst({
        where: { id: row.batchId, itemId: row.itemId, branchId, item: { tenantId: session.user.tenantId } },
      });
      if (!batch) throw new Error("One of the batches in this return was not found");
      if (batch.currentQty < row.qty) {
        throw new Error(`Only ${batch.currentQty} in stock for batch ${batch.batchNo} — can't return ${row.qty}`);
      }
    }

    const pr = await tx.purchaseReturn.create({
      data: {
        tenantId: session.user.tenantId,
        branchId,
        grnId: parsed.grnId || null,
        supplierId: parsed.supplierId,
        reason: parsed.reason,
        totalAmount,
        createdByUserId: session.user.id,
        items: {
          create: parsed.items.map((r) => ({
            itemId: r.itemId,
            batchId: r.batchId,
            qty: r.qty,
            rate: r.rate,
          })),
        },
      },
    });

    for (const row of parsed.items) {
      await tx.batch.update({
        where: { id: row.batchId },
        data: { currentQty: { decrement: row.qty } },
      });
    }

    await tx.supplierLedgerEntry.create({
      data: {
        tenantId: session.user.tenantId,
        supplierId: parsed.supplierId,
        type: "return",
        amount: -totalAmount,
        referenceId: pr.id,
        referenceType: "PurchaseReturn",
      },
    });

    return pr.id;
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "purchase_return.create",
    entity: "PurchaseReturn",
    entityId: returnId,
    after: { supplierId: parsed.supplierId, itemCount: parsed.items.length, totalAmount },
  });

  revalidatePath("/purchase-returns");
  revalidatePath("/items");
  revalidatePath("/pos");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  revalidatePath(`/suppliers/${parsed.supplierId}`);

  return { id: returnId };
}
