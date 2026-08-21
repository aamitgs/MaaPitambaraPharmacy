"use server";

import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { buildReceiptData } from "@/lib/receipt-data";
import { buildInvoiceWhere, type InvoiceFilter } from "@/lib/invoice-filter";
import { requireSession } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import { getBranding } from "@/lib/branding";

export async function getInvoiceForReceipt(id: string) {
  const session = await requireSession();
  return buildReceiptData({ id, tenantId: session.user.tenantId });
}

export type ReceiptData = NonNullable<Awaited<ReturnType<typeof getInvoiceForReceipt>>>;

/**
 * The invoice list, filtered.
 *
 * "Which bill did Mrs Sharma buy her insulin on?" is the question staff
 * actually ask, and answering it previously meant scrolling 200 rows.
 */
export async function listInvoices(filter: InvoiceFilter = {}) {
  const session = await requireSession();
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const where = buildInvoiceWhere(session.user.tenantId, filter, branchFilter);

  const [invoices, matchCount, totals] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      include: { customer: true },
      orderBy: { invoiceDate: "desc" },
      take: 200,
    }),
    prisma.salesInvoice.count({ where }),
    // Summed over everything matched, not just the 200 shown — otherwise
    // the figure silently changes meaning once a search gets broad.
    //
    // Cancelled bills are excluded by default, because a voided sale is
    // not revenue. But when someone has explicitly filtered *to* a status,
    // their filter wins: spreading `completed` over a `cancelled` search
    // produced a total describing invoices that were not on screen.
    prisma.salesInvoice.aggregate({
      where:
        filter.status && filter.status !== "all"
          ? where
          : { ...where, status: "completed" },
      _sum: { total: true },
    }),
  ]);

  const explicitStatus = Boolean(filter.status && filter.status !== "all");

  return {
    /** True when the money figure counts only completed bills. */
    totalExcludesCancelled: !explicitStatus,
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      customerName: inv.customer?.name ?? inv.patientName ?? "Walk-in",
      paymentMode: inv.paymentMode,
      status: inv.status,
      total: Number(inv.total),
    })),
    matchCount,
    shownCount: invoices.length,
    matchedTotal: Number(totals._sum.total ?? 0),
  };
}
