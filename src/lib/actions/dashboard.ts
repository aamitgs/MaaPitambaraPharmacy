"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { getBackupStatus } from "@/lib/actions/backup";
import { getAlerts } from "@/lib/actions/alerts";
import { getReceivablesSummary } from "@/lib/receivables-summary";
import { getBranchFilter } from "@/lib/branch-scope";

export async function getDashboardData() {
  const session = await requireSession();
  const tenantId = session.user.tenantId;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const branchFilter = await getBranchFilter(tenantId, session.user.role);

  // Seven whole days ending today, oldest first — the window the trend
  // chart plots. Bucketed in JS rather than grouped in SQL: a single
  // pharmacy's week of invoices is a handful of rows, and this keeps the
  // day boundaries in the server's timezone instead of the database's.
  const trendStart = new Date(startOfDay);
  trendStart.setDate(trendStart.getDate() - 6);

  const yesterdayStart = new Date(startOfDay);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const monthStart = new Date(startOfDay);
  monthStart.setDate(1);

  const [
    salesToday,
    tenant,
    backupStatus,
    alerts,
    supplierOutstanding,
    trendInvoices,
    yesterdaySales,
    monthSales,
    recentInvoices,
    openPurchaseOrders,
    refundsToday,
    refundsYesterday,
    refundsThisMonth,
    trendRefunds,
    receivables,
  ] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: { tenantId, status: "completed", invoiceDate: { gte: startOfDay }, ...branchFilter },
      _sum: { total: true },
      _count: true,
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    getBackupStatus(),
    getAlerts(),
    prisma.supplierLedgerEntry.aggregate({ where: { tenantId }, _sum: { amount: true } }),
    prisma.salesInvoice.findMany({
      where: {
        tenantId,
        status: "completed",
        invoiceDate: { gte: trendStart },
        ...branchFilter,
      },
      select: { invoiceDate: true, total: true },
    }),
    prisma.salesInvoice.aggregate({
      where: {
        tenantId,
        status: "completed",
        invoiceDate: { gte: yesterdayStart, lt: startOfDay },
        ...branchFilter,
      },
      _sum: { total: true },
    }),
    prisma.salesInvoice.aggregate({
      where: {
        tenantId,
        status: "completed",
        invoiceDate: { gte: monthStart },
        ...branchFilter,
      },
      _sum: { total: true },
    }),
    prisma.salesInvoice.findMany({
      where: { tenantId, status: "completed", ...branchFilter },
      orderBy: { invoiceDate: "desc" },
      take: 6,
      select: {
        id: true,
        invoiceNo: true,
        invoiceDate: true,
        total: true,
        paymentMode: true,
        customer: { select: { name: true } },
      },
    }),
    // "Open" is anything not yet received or cancelled — the ones still
    // waiting on a delivery.
    prisma.purchaseOrder.count({
      where: { tenantId, status: { in: ["draft", "sent"] }, ...branchFilter },
    }),
    // Money handed back has to come off the figure the counter reconciles
    // against, or the drawer will be short by exactly this amount with
    // nothing on screen explaining why.
    prisma.salesReturn.aggregate({
      where: { tenantId, returnedAt: { gte: startOfDay } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.salesReturn.aggregate({
      where: { tenantId, returnedAt: { gte: yesterdayStart, lt: startOfDay } },
      _sum: { total: true },
    }),
    prisma.salesReturn.aggregate({
      where: { tenantId, returnedAt: { gte: monthStart } },
      _sum: { total: true },
    }),
    prisma.salesReturn.findMany({
      where: { tenantId, returnedAt: { gte: trendStart } },
      select: { returnedAt: true, total: true },
    }),
    // Same computation the Receivables screen runs, so the tile and the
    // page it links to cannot disagree.
    getReceivablesSummary(tenantId),
  ]);

  const buckets = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const day = new Date(trendStart);
    day.setDate(trendStart.getDate() + i);
    buckets.set(day.toDateString(), 0);
  }
  for (const invoice of trendInvoices) {
    const key = new Date(invoice.invoiceDate).toDateString();
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(invoice.total));
  }
  // Same buckets, subtracted — the chart and the headline must agree.
  for (const refund of trendRefunds) {
    const key = new Date(refund.returnedAt).toDateString();
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) - Number(refund.total));
  }
  const salesTrend = [...buckets.entries()].map(([date, total]) => ({
    date: new Date(date).toISOString(),
    total,
  }));

  const todayBilled = Number(salesToday._sum.total ?? 0);
  const todayRefunded = Number(refundsToday._sum.total ?? 0);
  const yesterdayNet =
    Number(yesterdaySales._sum.total ?? 0) - Number(refundsYesterday._sum.total ?? 0);

  return {
    /** Billed before refunds — kept so the two figures can be shown apart. */
    todayBilledTotal: todayBilled,
    todayRefundTotal: todayRefunded,
    todayRefundCount: refundsToday._count,
    /** What the drawer should actually hold: billed less money handed back. */
    todaySalesTotal: todayBilled - todayRefunded,
    todaySalesCount: salesToday._count,
    lowStockCount: alerts.lowStock.length,
    nearExpiryCount: alerts.nearExpiry.length,
    supplierOutstandingTotal: Number(supplierOutstanding._sum.amount ?? 0),
    /** Owed to the pharmacy by credit customers, payments applied. */
    customerOutstandingTotal: receivables.totalOutstanding,
    customerOverdueTotal: receivables.totalOverdue,
    overdueCustomerCount: receivables.overdueCustomerCount,
    backupStatus,
    pharmacyName: tenant.pharmacyName,
    // The rail hides what the signed-in role can't open, the same way the
    // sidebar does — a tile that leads to a refusal is worse than no tile.
    role: session.user.role,
    licenseExpiryCount: alerts.licenseExpiry.length,
    licenseExpirySoonest: alerts.licenseExpiry[0] ?? null,
    openPurchaseOrderCount: openPurchaseOrders,
    salesTrend,
    yesterdaySalesTotal: yesterdayNet,
    monthToDateTotal:
      Number(monthSales._sum.total ?? 0) - Number(refundsThisMonth._sum.total ?? 0),
    recentInvoices: recentInvoices.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      invoiceDate: i.invoiceDate.toISOString(),
      total: Number(i.total),
      paymentMode: i.paymentMode,
      customerName: i.customer?.name ?? null,
    })),
  };
}
