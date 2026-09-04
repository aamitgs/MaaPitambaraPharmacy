"use server";

import { nextDocumentNumber } from "@/lib/document-number";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

/**
 * Customer returns — the credit-note side of billing, distinct from
 * PurchaseReturn (stock going back to a distributor).
 *
 * Five rules are enforced here, server-side, because the client is not a
 * safe place to decide any of them:
 *   1. the sale must fall inside the owner's return window
 *   2. the manager PIN must verify
 *   3. Schedule H/H1/X never comes back — a prescription medicine that has
 *      left the counter cannot re-enter saleable stock
 *   4. a batch already inside the near-expiry window is refused: buying back
 *      stock you cannot sell on is not a return, it is a write-off
 *   5. quantity is capped at what was sold, less what has already come back
 */
export type ReturnableLine = {
  invoiceItemId: string;
  itemName: string;
  batchNo: string;
  scheduleClass: string;
  expiryDate: string;
  soldQty: number;
  alreadyReturned: number;
  returnableQty: number;
  rate: number;
  taxRate: number;
  /** Non-null when this line can't be returned at all, with the reason. */
  blockedReason: string | null;
};

export type ReturnableInvoice = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  paymentMode: string;
  customerId: string | null;
  customerName: string | null;
  windowDays: number;
  daysSinceSale: number;
  windowExpired: boolean;
  lines: ReturnableLine[];
};

const SCHEDULE_BLOCKED = new Set(["H", "H1", "X"]);

export async function getReturnableInvoice(invoiceId: string): Promise<ReturnableInvoice | null> {
  const session = await requirePermission("sales.cancel");

  const [invoice, tenant] = await Promise.all([
    prisma.salesInvoice.findFirst({
      where: { id: invoiceId, tenantId: session.user.tenantId },
      include: {
        customer: { select: { id: true, name: true } },
        items: { include: { item: true, batch: true, returnItems: true } },
      },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
  ]);
  if (!invoice) return null;

  const now = new Date();
  const daysSinceSale = Math.floor(
    (now.getTime() - invoice.invoiceDate.getTime()) / 86_400_000
  );
  const windowDays = tenant.salesReturnWindowDays;
  const nearExpiryCutoff = new Date(now);
  nearExpiryCutoff.setDate(nearExpiryCutoff.getDate() + tenant.nearExpiryWindowDays);

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate.toISOString(),
    paymentMode: invoice.paymentMode,
    customerId: invoice.customer?.id ?? null,
    customerName: invoice.customer?.name ?? null,
    windowDays,
    daysSinceSale,
    windowExpired: windowDays === 0 || daysSinceSale > windowDays,
    lines: invoice.items.map((line) => {
      const alreadyReturned = line.returnItems.reduce((sum, r) => sum + r.qty, 0);
      const schedule = String(line.item.scheduleClass);
      let blockedReason: string | null = null;
      if (SCHEDULE_BLOCKED.has(schedule)) {
        blockedReason = `Schedule ${schedule} — cannot be taken back`;
      } else if (line.batch.expiryDate <= nearExpiryCutoff) {
        blockedReason = "Batch is near expiry — cannot be resold";
      } else if (alreadyReturned >= line.qty) {
        blockedReason = "Already returned in full";
      }

      return {
        invoiceItemId: line.id,
        itemName: line.item.name,
        batchNo: line.batch.batchNo,
        scheduleClass: schedule,
        expiryDate: line.batch.expiryDate.toISOString(),
        soldQty: line.qty,
        alreadyReturned,
        returnableQty: Math.max(0, line.qty - alreadyReturned),
        rate: Number(line.rate),
        taxRate: Number(line.taxRate),
        blockedReason,
      };
    }),
  };
}

const createSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().trim().min(1, "Give a reason for the return"),
  refundMethod: z.enum(["cash", "upi", "card", "credit_account"]),
  managerPin: z.string().trim().min(1, "Manager PIN is required"),
  lines: z
    .array(
      z.object({
        invoiceItemId: z.string().min(1),
        qty: z.coerce.number().int().positive(),
        restock: z.boolean(),
      })
    )
    .min(1, "Select at least one item to return"),
});

export async function createSalesReturn(input: z.infer<typeof createSchema>) {
  const session = await requirePermission("sales.cancel");
  const parsed = createSchema.parse(input);

  const [invoice, tenant] = await Promise.all([
    prisma.salesInvoice.findFirst({
      where: { id: parsed.invoiceId, tenantId: session.user.tenantId },
      include: { items: { include: { item: true, batch: true, returnItems: true } } },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
  ]);
  if (!invoice) throw new Error("Invoice not found");

  // 1. window
  const daysSinceSale = Math.floor(
    (Date.now() - invoice.invoiceDate.getTime()) / 86_400_000
  );
  if (tenant.salesReturnWindowDays === 0) {
    throw new Error("Returns are switched off for this pharmacy");
  }
  if (daysSinceSale > tenant.salesReturnWindowDays) {
    throw new Error(
      `Sold ${daysSinceSale} days ago — outside the ${tenant.salesReturnWindowDays}-day return window`
    );
  }

  // 2. manager PIN
  if (!tenant.managerPinHash) throw new Error("No manager PIN is set for this pharmacy");
  if (!(await bcrypt.compare(parsed.managerPin, tenant.managerPinHash))) {
    throw new Error("That manager PIN is incorrect");
  }

  const nearExpiryCutoff = new Date();
  nearExpiryCutoff.setDate(nearExpiryCutoff.getDate() + tenant.nearExpiryWindowDays);

  const priced = parsed.lines.map((line) => {
    const sold = invoice.items.find((i) => i.id === line.invoiceItemId);
    if (!sold) throw new Error("That line is not on this invoice");

    // 3. schedule
    const schedule = String(sold.item.scheduleClass);
    if (SCHEDULE_BLOCKED.has(schedule)) {
      throw new Error(`${sold.item.name} is Schedule ${schedule} and cannot be taken back`);
    }
    // 4. near expiry
    if (sold.batch.expiryDate <= nearExpiryCutoff) {
      throw new Error(`${sold.item.name} batch ${sold.batch.batchNo} is near expiry`);
    }
    // 5. quantity
    const already = sold.returnItems.reduce((sum, r) => sum + r.qty, 0);
    if (line.qty > sold.qty - already) {
      throw new Error(
        `Only ${sold.qty - already} of ${sold.item.name} can still be returned`
      );
    }

    const rate = Number(sold.rate);
    const taxRate = Number(sold.taxRate);
    // Priced off the original line, not today's rate: a refund returns what
    // the customer actually paid. `sold.discountAmount` is the discount for
    // the whole original line (item + scheme + bill-discount share), so a
    // partial return prorates it by the fraction of units coming back —
    // otherwise a discounted sale refunds at the pre-discount rate.
    const discountShare = round2((Number(sold.discountAmount) * line.qty) / sold.qty);
    const taxable = round2(line.qty * rate - discountShare);
    const tax = round2((taxable * taxRate) / 100);
    return { sold, line, rate, taxRate, taxable, tax, lineTotal: round2(taxable + tax) };
  });

  const subtotal = round2(priced.reduce((s, p) => s + p.taxable, 0));
  const taxAmount = round2(priced.reduce((s, p) => s + p.tax, 0));
  const total = round2(subtotal + taxAmount);

  if (parsed.refundMethod === "credit_account" && !invoice.customerId) {
    throw new Error("This was a walk-in sale — there is no credit account to refund to");
  }

  const returnId = await prisma.$transaction(async (tx) => {
    const returnNo = await nextDocumentNumber(tx, session.user.tenantId, "CN");

    const created = await tx.salesReturn.create({
      data: {
        tenantId: session.user.tenantId,
        branchId: invoice.branchId,
        salesInvoiceId: invoice.id,
        returnNo,
        createdByUserId: session.user.id,
        reason: parsed.reason,
        refundMethod: parsed.refundMethod,
        subtotal,
        taxAmount,
        total,
        items: {
          create: priced.map((p) => ({
            invoiceItemId: p.sold.id,
            itemId: p.sold.itemId,
            batchId: p.sold.batchId,
            qty: p.line.qty,
            restock: p.line.restock,
            rate: p.rate,
            taxRate: p.taxRate,
            lineTotal: p.lineTotal,
          })),
        },
      },
    });

    // Stock only moves for lines marked resaleable.
    for (const p of priced) {
      if (!p.line.restock) continue;
      await tx.batch.update({
        where: { id: p.sold.batchId },
        data: { currentQty: { increment: p.line.qty } },
      });
    }

    if (parsed.refundMethod === "credit_account" && invoice.customerId) {
      await tx.customerLedgerEntry.create({
        data: {
          tenantId: session.user.tenantId,
          customerId: invoice.customerId,
          type: "return",
          // Negative: a credit note reduces what the customer owes.
          amount: -total,
          referenceId: created.id,
          referenceType: "sales_return",
          note: `Credit note ${returnNo}`,
        },
      });
    }

    return created.id;
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sales_return.create",
    entity: "SalesReturn",
    entityId: returnId,
    after: { invoiceNo: invoice.invoiceNo, total, refundMethod: parsed.refundMethod },
  });

  revalidatePath("/sales-returns");
  revalidatePath(`/invoices/${invoice.id}/receipt`);
  return { id: returnId };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type SalesReturnRow = {
  id: string;
  returnNo: string;
  returnedAt: string;
  invoiceId: string;
  invoiceNo: string;
  total: number;
  refundMethod: string;
  reason: string;
  createdByName: string;
  itemCount: number;
};

export async function listSalesReturns(): Promise<SalesReturnRow[]> {
  const session = await requireSession();
  const rows = await prisma.salesReturn.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { returnedAt: "desc" },
    take: 100,
    include: {
      invoice: { select: { invoiceNo: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    returnNo: r.returnNo,
    returnedAt: r.returnedAt.toISOString(),
    invoiceId: r.salesInvoiceId,
    invoiceNo: r.invoice.invoiceNo,
    total: Number(r.total),
    refundMethod: r.refundMethod,
    reason: r.reason,
    createdByName: r.createdBy.name,
    itemCount: r._count.items,
  }));
}

export async function getSalesReturn(id: string) {
  const session = await requireSession();
  const row = await prisma.salesReturn.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      branch: true,
      createdBy: { select: { name: true } },
      invoice: { select: { invoiceNo: true, invoiceDate: true } },
      items: { include: { item: true, batch: true } },
    },
  });
  if (!row) return null;

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.user.tenantId },
  });

  return {
    id: row.id,
    returnNo: row.returnNo,
    returnedAt: row.returnedAt.toISOString(),
    reason: row.reason,
    refundMethod: row.refundMethod,
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.taxAmount),
    total: Number(row.total),
    createdByName: row.createdBy.name,
    invoiceId: row.salesInvoiceId,
    invoiceNo: row.invoice.invoiceNo,
    invoiceDate: row.invoice.invoiceDate.toISOString(),
    pharmacyName: tenant.pharmacyName,
    branch: {
      name: row.branch.name,
      licensedAddress: row.branch.licensedAddress,
      gstin: row.branch.gstin,
    },
    items: row.items.map((i) => ({
      id: i.id,
      itemName: i.item.name,
      batchNo: i.batch.batchNo,
      qty: i.qty,
      restock: i.restock,
      rate: Number(i.rate),
      taxRate: Number(i.taxRate),
      lineTotal: Number(i.lineTotal),
    })),
  };
}
