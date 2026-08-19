"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import {
  serializeSupplier,
  serializeSupplierLedgerEntry,
  type PlainSupplier,
} from "@/lib/serialize";

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  gstin: z.string().trim().optional(),
  address: z.string().trim().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).optional(),
  // Relative path returned by /api/uploads/purchase-invoice.
  documentImageUrl: z.string().nullish(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

/**
 * Supplier.outstandingBalance is a cache column, never trusted. The real
 * balance is always the sum of this supplier's ledger entries (purchases
 * positive, payments/returns negative).
 */
async function computeOutstandingBalances(tenantId: string, supplierIds?: string[]) {
  const grouped = await prisma.supplierLedgerEntry.groupBy({
    by: ["supplierId"],
    where: { tenantId, ...(supplierIds ? { supplierId: { in: supplierIds } } : {}) },
    _sum: { amount: true },
  });
  const balances = new Map<string, number>();
  for (const g of grouped) balances.set(g.supplierId, Number(g._sum.amount ?? 0));
  return balances;
}

export async function listSuppliers(): Promise<PlainSupplier[]> {
  const session = await requireSession();
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });
  const balances = await computeOutstandingBalances(session.user.tenantId);
  return suppliers.map((s) => ({
    ...serializeSupplier(s),
    outstandingBalance: balances.get(s.id) ?? 0,
  }));
}

export async function getSupplier(id: string) {
  const session = await requireSession();
  const supplier = await prisma.supplier.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!supplier) return null;

  const ledgerEntries = await prisma.supplierLedgerEntry.findMany({
    where: { supplierId: id, tenantId: session.user.tenantId },
    orderBy: { createdAt: "desc" },
  });
  const balances = await computeOutstandingBalances(session.user.tenantId, [id]);

  return {
    ...serializeSupplier(supplier),
    outstandingBalance: balances.get(id) ?? 0,
    ledgerEntries: ledgerEntries.map(serializeSupplierLedgerEntry),
  };
}

export async function createSupplier(input: SupplierInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = supplierSchema.parse(input);

  const supplier = await prisma.supplier.create({
    data: { ...parsed, tenantId: session.user.tenantId },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "supplier.create",
    entity: "Supplier",
    entityId: supplier.id,
    after: parsed,
  });

  revalidatePath("/suppliers");
  return serializeSupplier(supplier);
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = supplierSchema.parse(input);

  const before = await prisma.supplier.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!before) throw new Error("Supplier not found");

  const supplier = await prisma.supplier.update({
    where: { id },
    data: parsed,
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "supplier.update",
    entity: "Supplier",
    entityId: supplier.id,
    before,
    after: parsed,
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return serializeSupplier(supplier);
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  note: z.string().trim().optional(),
});

export type SupplierPaymentInput = z.infer<typeof paymentSchema>;

export async function recordSupplierPayment(supplierId: string, input: SupplierPaymentInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = paymentSchema.parse(input);

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId: session.user.tenantId },
  });
  if (!supplier) throw new Error("Supplier not found");

  const entry = await prisma.supplierLedgerEntry.create({
    data: {
      tenantId: session.user.tenantId,
      supplierId,
      type: "payment",
      amount: -Math.abs(parsed.amount),
      note: parsed.note,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "supplier.payment",
    entity: "SupplierLedgerEntry",
    entityId: entry.id,
    after: parsed,
  });

  revalidatePath(`/suppliers/${supplierId}`);
  return serializeSupplierLedgerEntry(entry);
}
