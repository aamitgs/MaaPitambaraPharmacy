"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { resolveConcreteBranch, getBranchFilter } from "@/lib/branch-scope";
import { isBatchExpired } from "@/lib/expiry";

/**
 * Medicines customers asked for that were not in stock.
 *
 * Gated on `sales.sell`: whoever is at the counter when the customer asks
 * is the person who has to write it down, and a promise nobody can record
 * is a promise that gets forgotten.
 */

const createSchema = z.object({
  itemId: z.string().optional(),
  requestedName: z.string().trim().min(1, "What did they ask for?").max(160),
  qty: z.coerce.number().int().positive().default(1),
  customerId: z.string().optional(),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function createPromiseOrder(input: z.infer<typeof createSchema>) {
  const session = await requirePermission("sales.sell");
  const tenantId = session.user.tenantId;
  const parsed = createSchema.parse(input);
  const branchId = await resolveConcreteBranch(tenantId, session.user.role);

  // Without a way to reach them, an arrival can never be acted on — so
  // this is required rather than merely encouraged.
  if (!parsed.phone?.trim() && !parsed.customerId) {
    throw new Error(
      "Record a phone number, or pick a customer on file — otherwise there is no way to tell them when it arrives."
    );
  }

  const order = await prisma.promiseOrder.create({
    data: {
      tenantId,
      branchId,
      itemId: parsed.itemId || null,
      requestedName: parsed.requestedName,
      qty: parsed.qty,
      customerId: parsed.customerId || null,
      contactName: parsed.contactName || null,
      phone: parsed.phone || null,
      note: parsed.note || null,
      takenByUserId: session.user.id,
    },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "promiseOrder.create",
    entity: "PromiseOrder",
    entityId: order.id,
    after: { requested: parsed.requestedName, qty: parsed.qty, phone: parsed.phone ?? null },
  });

  revalidatePath("/promise-orders");
  return { id: order.id };
}

export type PromiseOrderRow = {
  id: string;
  requestedName: string;
  qty: number;
  itemId: string | null;
  itemName: string | null;
  customerName: string | null;
  phone: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  notifiedAt: string | null;
  takenByName: string;
  /** Sellable stock right now; null when the item was never in the master. */
  availableQty: number | null;
  /** True when there is enough on the shelf to honour it today. */
  canFulfil: boolean;
  daysWaiting: number;
};

/**
 * Open orders with live availability.
 *
 * Stock is counted from batches that are in date — an expired batch cannot
 * fulfil a promise, and showing it as available would send someone to the
 * shelf for something they are not allowed to sell.
 */
export async function listPromiseOrders(status: "open" | "all" = "open") {
  const session = await requirePermission("sales.sell");
  const tenantId = session.user.tenantId;
  const branchFilter = await getBranchFilter(tenantId, session.user.role);

  const orders = await prisma.promiseOrder.findMany({
    where: {
      tenantId,
      ...branchFilter,
      ...(status === "open" ? { status: "open" } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 300,
    include: {
      item: { select: { id: true, name: true } },
      customer: { select: { name: true } },
      takenBy: { select: { name: true } },
    },
  });

  const itemIds = [...new Set(orders.map((o) => o.itemId).filter(Boolean))] as string[];
  const batches = itemIds.length
    ? await prisma.batch.findMany({
        where: { itemId: { in: itemIds }, currentQty: { gt: 0 }, ...branchFilter },
        select: { itemId: true, currentQty: true, expiryDate: true },
      })
    : [];

  const availableByItem = new Map<string, number>();
  for (const b of batches) {
    if (isBatchExpired(b.expiryDate)) continue;
    availableByItem.set(b.itemId, (availableByItem.get(b.itemId) ?? 0) + b.currentQty);
  }

  const now = Date.now();
  return orders.map((o): PromiseOrderRow => {
    const availableQty = o.itemId ? (availableByItem.get(o.itemId) ?? 0) : null;
    return {
      id: o.id,
      requestedName: o.requestedName,
      qty: o.qty,
      itemId: o.itemId,
      itemName: o.item?.name ?? null,
      customerName: o.customer?.name ?? o.contactName,
      phone: o.phone,
      note: o.note,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      notifiedAt: o.notifiedAt?.toISOString() ?? null,
      takenByName: o.takenBy.name,
      availableQty,
      canFulfil: o.status === "open" && availableQty !== null && availableQty >= o.qty,
      daysWaiting: Math.floor((now - o.createdAt.getTime()) / 86_400_000),
    };
  });
}

/** How many open orders can be honoured right now — for the nav badge. */
export async function countFulfillablePromiseOrders() {
  const rows = await listPromiseOrders("open");
  return rows.filter((r) => r.canFulfil).length;
}

export async function markPromiseOrderNotified(id: string) {
  const session = await requirePermission("sales.sell");
  const order = await prisma.promiseOrder.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, requestedName: true },
  });
  if (!order) throw new Error("Order not found");

  await prisma.promiseOrder.update({ where: { id }, data: { notifiedAt: new Date() } });
  revalidatePath("/promise-orders");
}

export async function fulfilPromiseOrder(id: string, invoiceId?: string) {
  const session = await requirePermission("sales.sell");
  const tenantId = session.user.tenantId;
  const order = await prisma.promiseOrder.findFirst({
    where: { id, tenantId },
    select: { id: true, requestedName: true, status: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.status !== "open") throw new Error("That order is already closed");

  await prisma.promiseOrder.update({
    where: { id },
    data: {
      status: "fulfilled",
      fulfilledAt: new Date(),
      fulfilledInvoiceId: invoiceId ?? null,
    },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "promiseOrder.fulfil",
    entity: "PromiseOrder",
    entityId: id,
    after: { requested: order.requestedName, invoiceId: invoiceId ?? null },
  });

  revalidatePath("/promise-orders");
}

export async function cancelPromiseOrder(id: string, reason: string) {
  const session = await requirePermission("sales.sell");
  const tenantId = session.user.tenantId;
  const order = await prisma.promiseOrder.findFirst({
    where: { id, tenantId },
    select: { id: true, requestedName: true, status: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.status !== "open") throw new Error("That order is already closed");

  await prisma.promiseOrder.update({
    where: { id },
    data: { status: "cancelled", cancelledReason: reason.trim() || null },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "promiseOrder.cancel",
    entity: "PromiseOrder",
    entityId: id,
    after: { requested: order.requestedName, reason },
  });

  revalidatePath("/promise-orders");
}
