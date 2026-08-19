"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { getBackupStatus } from "@/lib/actions/backup";
import { getAlerts } from "@/lib/actions/alerts";
import { getBranchFilter } from "@/lib/branch-scope";

export async function getDashboardData() {
  const session = await requireSession();
  const tenantId = session.user.tenantId;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const branchFilter = await getBranchFilter(tenantId, session.user.role);

  const [salesToday, tenant, backupStatus, alerts, supplierOutstanding] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: { tenantId, status: "completed", invoiceDate: { gte: startOfDay }, ...branchFilter },
      _sum: { total: true },
      _count: true,
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    getBackupStatus(),
    getAlerts(),
    prisma.supplierLedgerEntry.aggregate({ where: { tenantId }, _sum: { amount: true } }),
  ]);

  return {
    todaySalesTotal: Number(salesToday._sum.total ?? 0),
    todaySalesCount: salesToday._count,
    lowStockCount: alerts.lowStock.length,
    nearExpiryCount: alerts.nearExpiry.length,
    supplierOutstandingTotal: Number(supplierOutstanding._sum.amount ?? 0),
    backupStatus,
    pharmacyName: tenant.pharmacyName,
    licenseExpiryCount: alerts.licenseExpiry.length,
    licenseExpirySoonest: alerts.licenseExpiry[0] ?? null,
  };
}
