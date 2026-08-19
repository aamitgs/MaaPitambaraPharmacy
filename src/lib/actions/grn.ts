"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { serializeGrnItem, serializeSupplier } from "@/lib/serialize";
import { getBranchFilter, resolveConcreteBranch } from "@/lib/branch-scope";
import { runEwayBillAttemptForGrn } from "@/lib/gsp/engine";

const grnItemSchema = z.object({
  itemId: z.string().min(1),
  batchNo: z.string().trim().min(1, "Batch number is required"),
  mfgDate: z.string().optional(),
  expiryDate: z.string().min(1, "Expiry date is required"),
  mrp: z.coerce.number().positive("MRP must be greater than 0"),
  rate: z.coerce.number().min(0),
  qty: z.coerce.number().int().positive("Qty must be greater than 0"),
});

const grnSchema = z.object({
  supplierId: z.string().min(1, "Select a supplier"),
  purchaseOrderId: z.string().optional(),
  supplierInvoiceNo: z.string().trim().min(1, "Supplier invoice number is required"),
  supplierInvoiceDate: z.string().min(1, "Supplier invoice date is required"),
  // Relative path returned by /api/uploads/purchase-invoice — the photo or
  // PDF of the distributor bill this GRN was keyed in from.
  invoiceImagePath: z.string().optional(),
  items: z.array(grnItemSchema).min(1, "Add at least one item"),
});

export type GrnInput = z.infer<typeof grnSchema>;

export async function listGrns() {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const grns = await prisma.grn.findMany({
    where: { tenantId: session.user.tenantId, ...branchFilter },
    include: { supplier: true, items: true },
    orderBy: { receivedAt: "desc" },
  });
  return grns.map((g) => ({
    id: g.id,
    supplierName: g.supplier.name,
    supplierInvoiceNo: g.supplierInvoiceNo,
    receivedAt: g.receivedAt,
    itemCount: g.items.length,
    total: g.items.reduce((sum, i) => sum + i.qty * Number(i.rate), 0),
  }));
}

export async function getGrn(id: string) {
  const session = await requireSession();
  const grn = await prisma.grn.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      supplier: true,
      branch: true,
      receivedBy: { select: { name: true } },
      items: { include: { item: { select: { name: true, unit: true } } } },
    },
  });
  if (!grn) return null;

  const total = grn.items.reduce((sum, i) => sum + i.qty * Number(i.rate), 0);

  return {
    id: grn.id,
    supplier: serializeSupplier(grn.supplier),
    purchaseOrderId: grn.purchaseOrderId,
    supplierInvoiceNo: grn.supplierInvoiceNo,
    supplierInvoiceDate: grn.supplierInvoiceDate,
    invoiceImageUrl: grn.invoiceImageUrl,
    receivedAt: grn.receivedAt,
    receivedByName: grn.receivedBy.name,
    total,
    ewayBillNo: grn.ewayBillNo,
    ewayBillThreshold: Number(grn.branch.ewayBillThreshold),
    items: grn.items.map((i) => ({
      ...serializeGrnItem(i),
      itemName: i.item.name,
      unit: i.item.unit,
    })),
  };
}

export async function createGrn(input: GrnInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = grnSchema.parse(input);

  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this pharmacy yet.");

  const supplier = await prisma.supplier.findFirst({
    where: { id: parsed.supplierId, tenantId: session.user.tenantId },
  });
  if (!supplier) throw new Error("Supplier not found");

  if (parsed.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: parsed.purchaseOrderId, tenantId: session.user.tenantId },
    });
    if (!po) throw new Error("Purchase order not found");
  }

  const total = parsed.items.reduce((sum, i) => sum + i.qty * i.rate, 0);

  const grnId = await prisma.$transaction(async (tx) => {
    const grn = await tx.grn.create({
      data: {
        tenantId: session.user.tenantId,
        branchId,
        purchaseOrderId: parsed.purchaseOrderId || null,
        supplierId: parsed.supplierId,
        supplierInvoiceNo: parsed.supplierInvoiceNo,
        supplierInvoiceDate: new Date(parsed.supplierInvoiceDate),
        invoiceImageUrl: parsed.invoiceImagePath || null,
        receivedByUserId: session.user.id,
      },
    });

    for (const row of parsed.items) {
      const item = await tx.item.findFirst({
        where: { id: row.itemId, tenantId: session.user.tenantId },
      });
      if (!item) throw new Error("One of the items in this GRN was not found");

      const expiryDate = new Date(row.expiryDate);
      const mfgDate = row.mfgDate ? new Date(row.mfgDate) : null;

      // Scoped to this branch — the same batch number can exist as a
      // separate row at another branch (received there independently, or
      // arrived via a stock transfer), so matching must not cross branches.
      const existingBatch = await tx.batch.findFirst({
        where: { itemId: row.itemId, batchNo: row.batchNo, branchId },
      });

      const batch = existingBatch
        ? await tx.batch.update({
            where: { id: existingBatch.id },
            data: {
              currentQty: { increment: row.qty },
              mrp: row.mrp,
              purchaseRate: row.rate,
              expiryDate,
              mfgDate,
            },
          })
        : await tx.batch.create({
            data: {
              itemId: row.itemId,
              branchId,
              batchNo: row.batchNo,
              mfgDate,
              expiryDate,
              mrp: row.mrp,
              purchaseRate: row.rate,
              // GRN entry doesn't capture a separate selling price (out of
              // scope this phase) — default to MRP; the pharmacist can
              // adjust it afterward from the item's batch edit screen.
              saleRate: row.mrp,
              currentQty: row.qty,
            },
          });

      await tx.grnItem.create({
        data: {
          grnId: grn.id,
          itemId: row.itemId,
          batchId: batch.id,
          batchNo: row.batchNo,
          mfgDate,
          expiryDate,
          mrp: row.mrp,
          rate: row.rate,
          qty: row.qty,
        },
      });
    }

    await tx.supplierLedgerEntry.create({
      data: {
        tenantId: session.user.tenantId,
        supplierId: parsed.supplierId,
        type: "purchase",
        amount: total,
        referenceId: grn.id,
        referenceType: "Grn",
      },
    });

    if (parsed.purchaseOrderId) {
      await tx.purchaseOrder.update({
        where: { id: parsed.purchaseOrderId },
        data: { status: "received" },
      });
    }

    return grn.id;
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "grn.create",
    entity: "Grn",
    entityId: grnId,
    after: {
      supplierId: parsed.supplierId,
      supplierInvoiceNo: parsed.supplierInvoiceNo,
      itemCount: parsed.items.length,
      total,
    },
  });

  revalidatePath("/grn");
  revalidatePath("/items");
  revalidatePath("/pos");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  revalidatePath(`/suppliers/${parsed.supplierId}`);
  if (parsed.purchaseOrderId) revalidatePath(`/purchase-orders/${parsed.purchaseOrderId}`);

  // Fire-and-forget, same as the POS e-way bill hook — never block GRN
  // save on a third-party API call.
  void runEwayBillAttemptForGrn(grnId).catch(() => {});

  return { id: grnId };
}
