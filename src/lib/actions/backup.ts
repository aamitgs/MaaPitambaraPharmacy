"use server";

import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { encryptBackup } from "@/lib/backup-crypto";

async function gatherTenantData(tenantId: string) {
  const [tenant, branches, items, batches, customers, doctors, invoices] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.branch.findMany({ where: { tenantId } }),
    prisma.item.findMany({ where: { tenantId } }),
    prisma.batch.findMany({ where: { item: { tenantId } } }),
    prisma.customer.findMany({ where: { tenantId } }),
    prisma.doctor.findMany({ where: { tenantId } }),
    prisma.salesInvoice.findMany({
      where: { tenantId },
      include: { items: true, discounts: true },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    tenant,
    branches,
    items,
    batches,
    customers,
    doctors,
    invoices,
  };
}

export async function createManualBackup() {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;

  try {
    const data = await gatherTenantData(tenantId);
    const json = JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    );
    const encrypted = encryptBackup(json);

    await prisma.backupLog.create({
      data: { tenantId, destination: "manual", status: "success" },
    });

    const filename = `pharmacy-backup-${tenantId}-${new Date().toISOString().slice(0, 10)}.enc`;
    return { ok: true as const, filename, base64: encrypted.toString("base64") };
  } catch (e) {
    await prisma.backupLog.create({
      data: { tenantId, destination: "manual", status: "failed" },
    });
    throw e;
  }
}

export async function getBackupStatus() {
  const session = await requireSession();
  const last = await prisma.backupLog.findFirst({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: "desc" },
  });
  const staleAfterMs = 48 * 60 * 60 * 1000;
  return {
    lastBackupAt: last?.createdAt ?? null,
    lastBackupStatus: last?.status ?? null,
    isStale: !last || Date.now() - last.createdAt.getTime() > staleAfterMs,
  };
}
