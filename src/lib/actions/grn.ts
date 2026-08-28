"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession, hasPermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { serializeGrnItem, serializeSupplier } from "@/lib/serialize";
import { getBranchFilter, resolveConcreteBranch } from "@/lib/branch-scope";
import { runEwayBillAttemptForGrn } from "@/lib/gsp/engine";
import {
  comparePurchase,
  hasOvercharge,
  netCostImpact,
  type Variance,
} from "@/lib/purchase-variance";

const grnItemSchema = z.object({
  itemId: z.string().min(1),
  batchNo: z.string().trim().min(1, "Batch number is required"),
  mfgDate: z.string().optional(),
  expiryDate: z.string().min(1, "Expiry date is required"),
  mrp: z.coerce.number().positive("MRP must be greater than 0"),
  // Price To Retailer, from the distributor's invoice. Optional: most
  // stock is only ever sold retail. Only accepted from someone who may
  // bill at it — see the guard below.
  ptr: z.coerce.number().nonnegative().optional(),
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
  /// Set once the counter has been shown how this receipt differs from the
  /// purchase order and has chosen to receive it anyway.
  acknowledgeVariance: z.boolean().optional(),
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
  const session = await requirePermission("purchasing.manage");
  const parsed = grnSchema.parse(input);

  const branchId = await resolveConcreteBranch(session.user.tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this pharmacy yet.");

  const supplier = await prisma.supplier.findFirst({
    where: { id: parsed.supplierId, tenantId: session.user.tenantId },
  });
  if (!supplier) throw new Error("Supplier not found");

  // Setting a PTR is the same power as billing at one: whoever decides the
  // wholesale price decides how much margin the pharmacy gives away. So it
  // takes the same permission, and the same tenant-level switch — receiving
  // stock (purchasing.manage) is not enough on its own.
  if (parsed.items.some((r) => r.ptr !== undefined)) {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: session.user.tenantId },
      select: { wholesaleBillingEnabled: true },
    });
    if (!tenant.wholesaleBillingEnabled) {
      throw new Error("Wholesale billing is switched off for this pharmacy.");
    }
    if (!(await hasPermission("sales.wholesale"))) {
      throw new Error(
        "You are not allowed to set wholesale prices. Receive the stock without a PTR and ask the owner to add it."
      );
    }
  }

  // Checked before the constraint fires so the counter gets a sentence
  // rather than a Postgres error naming an index. The constraint is still
  // there and still the real guarantee — this is only the friendly path.
  const duplicate = await prisma.grn.findFirst({
    where: {
      tenantId: session.user.tenantId,
      supplierId: parsed.supplierId,
      supplierInvoiceNo: parsed.supplierInvoiceNo.trim(),
    },
    select: { id: true, receivedAt: true },
  });
  if (duplicate) {
    throw new Error(
      `Invoice ${parsed.supplierInvoiceNo} from ${supplier.name} was already received on ` +
        `${duplicate.receivedAt.toLocaleDateString("en-IN")}. Receiving it again would double ` +
        `the stock and double what you owe. Open the existing GRN if you need to check it.`
    );
  }

  // Compared against the order, not merely checked to exist. A rate above
  // the one agreed is money the pharmacy did not agree to spend, and the
  // purchase order is the only evidence of what was agreed.
  let variances: Variance[] = [];
  if (parsed.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: parsed.purchaseOrderId, tenantId: session.user.tenantId },
      include: { items: { include: { item: { select: { name: true } } } } },
    });
    if (!po) throw new Error("Purchase order not found");

    const itemNames = new Map(
      (
        await prisma.item.findMany({
          where: { id: { in: parsed.items.map((i) => i.itemId) }, tenantId: session.user.tenantId },
          select: { id: true, name: true },
        })
      ).map((i) => [i.id, i.name])
    );

    variances = comparePurchase(
      po.items.map((i) => ({
        itemId: i.itemId,
        itemName: i.item.name,
        qty: i.qty,
        rate: Number(i.rate),
      })),
      parsed.items.map((i) => ({
        itemId: i.itemId,
        itemName: itemNames.get(i.itemId) ?? "Unknown item",
        qty: i.qty,
        rate: i.rate,
      }))
    );

    // Only an overcharge stops the receipt. A short delivery is worth
    // recording but there is nothing to approve — the goods simply did
    // not come, and refusing to book what did arrive helps nobody.
    if (hasOvercharge(variances) && !parsed.acknowledgeVariance) {
      throw new Error(
        `PURCHASE_VARIANCE:${JSON.stringify({
          net: netCostImpact(variances),
          lines: variances.map((v) => ({ kind: v.kind, message: v.message })),
        })}`
      );
    }
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
              // Only written when the distributor's invoice carried one.
              ...(row.ptr !== undefined ? { ptr: row.ptr } : {}),
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
              ptr: row.ptr ?? null,
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
        // From the supplier's terms as they stand now. Null when no terms
        // are set, and then nothing is chased.
        dueDate:
          supplier.paymentTermsDays != null
            ? new Date(Date.now() + supplier.paymentTermsDays * 86_400_000)
            : null,
        referenceId: grn.id,
        referenceType: "Grn",
      },
    });

    // Checked before the constraint fires so the counter gets a sentence
  // rather than a Postgres error naming an index. The constraint is still
  // there and still the real guarantee — this is only the friendly path.
  const duplicate = await prisma.grn.findFirst({
    where: {
      tenantId: session.user.tenantId,
      supplierId: parsed.supplierId,
      supplierInvoiceNo: parsed.supplierInvoiceNo.trim(),
    },
    select: { id: true, receivedAt: true },
  });
  if (duplicate) {
    throw new Error(
      `Invoice ${parsed.supplierInvoiceNo} from ${supplier.name} was already received on ` +
        `${duplicate.receivedAt.toLocaleDateString("en-IN")}. Receiving it again would double ` +
        `the stock and double what you owe. Open the existing GRN if you need to check it.`
    );
  }

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
      // Kept with the receipt rather than only shown at the time. Six
      // months later, "why did we pay ₹32 when we ordered at ₹28" has an
      // answer, and a pattern of one distributor's overcharges is visible
      // in the audit log rather than only in somebody's memory.
      ...(variances.length > 0
        ? {
            varianceFromOrder: {
              netCostImpact: netCostImpact(variances),
              acknowledged: Boolean(parsed.acknowledgeVariance),
              lines: variances.map((v) => ({
                kind: v.kind,
                itemName: v.itemName,
                ordered: v.ordered,
                received: v.received,
                costImpact: v.costImpact,
              })),
            },
          }
        : {}),
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
