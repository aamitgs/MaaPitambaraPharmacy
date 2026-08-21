"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession, hasPermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { verifyManagerPin } from "@/lib/actions/pos";

/**
 * Voiding a bill that should never have been issued.
 *
 * Distinct from a sales return, and the distinction is the point. A return
 * is a real event — goods came back — and produces a credit note that
 * belongs in GSTR-1 Table 9B. A cancellation says the sale never happened:
 * a mis-scan, a double-ring, a customer who walked away at the card
 * machine. Filing a credit note for that overstates both sales and returns.
 *
 * Kept narrow so it cannot become a way to erase history:
 *   - same calendar day only; after that it is a credit note
 *   - nothing already returned against it
 *   - manager PIN, the same gate a return needs
 *   - the row is marked `cancelled`, never deleted, and every report
 *     already filters on `status: "completed"`
 */

const schema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().trim().min(3, "Say why — this is a permanent record").max(300),
  managerPin: z.string().trim().min(1, "Manager PIN is required"),
});

export type CancelInvoiceInput = z.infer<typeof schema>;

export async function cancelInvoice(input: CancelInvoiceInput) {
  const session = await requirePermission("sales.cancel");
  const tenantId = session.user.tenantId;
  const parsed = schema.parse(input);

  if (!(await verifyManagerPin(parsed.managerPin))) {
    throw new Error("That manager PIN is incorrect");
  }

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: parsed.invoiceId, tenantId },
    include: {
      items: true,
      salesReturns: { select: { returnNo: true } },
      discounts: { select: { couponId: true } },
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "cancelled") throw new Error("That invoice is already cancelled");

  if (invoice.salesReturns.length > 0) {
    throw new Error(
      `${invoice.salesReturns[0].returnNo} has already been raised against this bill. ` +
        `Cancel the return first, or raise another credit note instead.`
    );
  }

  // Same calendar day, in local time — the shop's day, not UTC's.
  const now = new Date();
  const sameDay =
    invoice.invoiceDate.getFullYear() === now.getFullYear() &&
    invoice.invoiceDate.getMonth() === now.getMonth() &&
    invoice.invoiceDate.getDate() === now.getDate();
  if (!sameDay) {
    throw new Error(
      "A bill can only be cancelled on the day it was raised. After that the sale has been " +
        "reported, so it has to be reversed with a credit note from Sales Returns."
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { status: "cancelled" },
    });

    // Stock goes straight back: nothing physically left the shop.
    for (const line of invoice.items) {
      if (!line.batchId) continue;
      await tx.batch.update({
        where: { id: line.batchId },
        data: { currentQty: { increment: line.qty } },
      });
    }

    // A cancelled bill must not keep consuming a single-use coupon.
    const couponIds = [...new Set(invoice.discounts.map((d) => d.couponId).filter(Boolean))];
    for (const couponId of couponIds) {
      await tx.coupon.update({
        where: { id: couponId as string },
        data: { usageCount: { decrement: 1 } },
      });
    }

    if (invoice.customerId) {
      // Spend drives the loyalty tier, so leaving it inflated would hand
      // out a discount the customer never earned.
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: { cumulativeSpend: { decrement: invoice.total } },
      });

      if (invoice.paymentMode === "credit") {
        await tx.customerLedgerEntry.create({
          data: {
            tenantId,
            customerId: invoice.customerId,
            // A reversing entry rather than deleting the original: the
            // statement should show both, so a customer querying their
            // balance can see what happened.
            type: "adjustment",
            amount: -Number(invoice.total),
            referenceId: invoice.id,
            referenceType: "SalesInvoice",
            note: `Cancelled ${invoice.invoiceNo}`,
          },
        });
      }
    }

    // Schedule X entries are a statutory register: the row stays and gets a
    // reversal beside it, exactly as a manual correction would.
    const narcotics = await tx.narcoticRegisterEntry.findMany({
      where: { invoiceId: invoice.id, reversalOfId: null },
    });
    for (const entry of narcotics) {
      const alreadyReversed = await tx.narcoticRegisterEntry.findUnique({
        where: { reversalOfId: entry.id },
      });
      if (alreadyReversed) continue;
      await tx.narcoticRegisterEntry.create({
        data: {
          tenantId,
          branchId: entry.branchId,
          invoiceId: entry.invoiceId,
          itemId: entry.itemId,
          batchId: entry.batchId,
          qty: -entry.qty,
          doctorId: entry.doctorId,
          patientName: entry.patientName,
          dispensedByUserId: session.user.id,
          reversalOfId: entry.id,
        },
      });
    }
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "invoice.cancel",
    entity: "SalesInvoice",
    entityId: invoice.id,
    before: { status: "completed", total: Number(invoice.total) },
    after: {
      status: "cancelled",
      invoiceNo: invoice.invoiceNo,
      reason: parsed.reason,
      linesRestocked: invoice.items.length,
    },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}/receipt`);
  revalidatePath("/dashboard");
  return { ok: true as const, invoiceNo: invoice.invoiceNo };
}

/**
 * Whether the Cancel button should appear at all — the same conditions
 * `cancelInvoice` enforces, asked ahead of time so staff are not offered an
 * action that is going to be refused.
 */
export async function canCancelInvoice(invoiceId: string): Promise<boolean> {
  const session = await requireSession();
  if (!(await hasPermission("sales.cancel"))) return false;

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, tenantId: session.user.tenantId },
    select: {
      status: true,
      invoiceDate: true,
      _count: { select: { salesReturns: true } },
    },
  });
  if (!invoice || invoice.status !== "completed") return false;
  if (invoice._count.salesReturns > 0) return false;

  const now = new Date();
  return (
    invoice.invoiceDate.getFullYear() === now.getFullYear() &&
    invoice.invoiceDate.getMonth() === now.getMonth() &&
    invoice.invoiceDate.getDate() === now.getDate()
  );
}
