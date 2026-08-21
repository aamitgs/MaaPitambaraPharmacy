"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession, requireRole } from "@/lib/rbac";
import { encryptBackup, decryptBackup } from "@/lib/backup-crypto";
import { writeAuditLog } from "@/lib/audit";
import {
  BACKUP_TABLES,
  BACKUP_VERSION,
  type BackupPayload,
  type BackupTable,
} from "@/lib/backup-schema";
import {
  countTable,
  writeTable,
  clearTable,
  RESTORE_ORDER,
  DELETE_ORDER,
} from "@/lib/backup-tables";
import { gatherTenantData, serializeBackup } from "@/lib/backup-payload";
import { parseBackup } from "@/lib/backup-parse";

export async function createManualBackup() {
  const session = await requirePermission("backup.manage");
  const tenantId = session.user.tenantId;

  try {
    const data = await gatherTenantData(tenantId);
    const encrypted = encryptBackup(serializeBackup(data));

    await prisma.backupLog.create({
      data: { tenantId, destination: "manual", status: "success" },
    });

    const totalRows = Object.values(data.counts).reduce((a, b) => a + b, 0);
    const filename = `pharmacy-backup-${tenantId}-${new Date().toISOString().slice(0, 10)}.enc`;
    return {
      ok: true as const,
      filename,
      base64: encrypted.toString("base64"),
      counts: data.counts,
      totalRows,
    };
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

/** Row counts as they stand right now, to compare against a backup file. */
export async function getLiveRowCounts() {
  const session = await requirePermission("backup.manage");
  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    counts[table] = await countTable(table, session.user.tenantId);
  }
  return counts;
}

export type BackupInspection = {
  version: number;
  exportedAt: string;
  tenantId: string;
  pharmacyName: string;
  counts: Record<string, number>;
  totalRows: number;
  /** True when the file came from this same pharmacy. */
  sameTenant: boolean;
};

/** Read a backup file and report what is in it — no writes. */
export async function inspectBackup(base64: string): Promise<BackupInspection> {
  const session = await requireRole(["owner"]);
  const payload = parseBackup(base64);

  return {
    version: payload.version,
    exportedAt: payload.exportedAt,
    tenantId: payload.tenantId,
    pharmacyName: String(payload.tenant.pharmacyName ?? "Unknown"),
    counts: payload.counts,
    totalRows: Object.values(payload.counts).reduce((a, b) => a + b, 0),
    sameTenant: payload.tenantId === session.user.tenantId,
  };
}

/**
 * Restore a backup over this tenant.
 *
 * Owner-only and typed-confirmation gated, because it is the single most
 * destructive action in the app: `replace` deletes every row this tenant
 * owns before writing the file's rows back.
 *
 * The whole thing runs in one transaction. A restore that fails halfway
 * would leave a pharmacy with invoices whose items are gone — so either the
 * entire file lands or nothing does.
 */
export async function restoreBackup(
  base64: string,
  mode: "replace" | "merge",
  confirmation: string
) {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;

  if (confirmation !== "RESTORE") {
    throw new Error('Type RESTORE to confirm.');
  }

  const payload = parseBackup(base64);
  if (payload.tenantId !== tenantId) {
    throw new Error(
      "That backup belongs to a different pharmacy. Restoring it here would mix two businesses' records."
    );
  }

  const restored: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      if (mode === "replace") {
        // Children first — a parent cannot be deleted while a row still
        // references it.
        for (const table of DELETE_ORDER) {
          await clearTable(tx, table, tenantId);
        }
      }

      // The tenant row itself is updated rather than recreated: the session
      // signing this restore is scoped to that id, and recreating it would
      // sign the owner out mid-transaction.
      const { id: _id, createdAt: _createdAt, ...tenantFields } = payload.tenant;
      await tx.tenant.update({ where: { id: tenantId }, data: tenantFields });

      for (const table of RESTORE_ORDER) {
        restored[table] = await writeTable(tx, table, payload.tables[table] ?? []);
      }
    },
    // A full restore is thousands of inserts; the 5s default gives up
    // partway through and rolls back a restore that was working fine.
    { timeout: 120_000, maxWait: 20_000 }
  );

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "backup.restore",
    entity: "Tenant",
    entityId: tenantId,
    after: {
      mode,
      exportedAt: payload.exportedAt,
      rowsRestored: Object.values(restored).reduce((a, b) => a + b, 0),
      counts: restored,
    },
  });

  return {
    ok: true as const,
    mode,
    restored,
    totalRows: Object.values(restored).reduce((a, b) => a + b, 0),
  };
}
