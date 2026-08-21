import "server-only";
import { prisma } from "@/lib/prisma";
import {
  BACKUP_TABLES,
  BACKUP_VERSION,
  type BackupPayload,
  type BackupTable,
} from "@/lib/backup-schema";
import { readTable } from "@/lib/backup-tables";

/**
 * Builds the full backup payload for one tenant.
 *
 * Deliberately shared between the "Backup now" button and the nightly
 * scheduled job. They used to be two implementations, and they drifted:
 * the manual export was widened to the full manifest while the scheduled
 * one kept hand-listing seven tables, so the automated backup a pharmacy
 * actually relies on was silently omitting suppliers, purchases, ledgers,
 * payments, stock movements and cash-ups — and logging success while it
 * did. One builder is the only way that stays fixed.
 */
export async function gatherTenantData(tenantId: string): Promise<BackupPayload> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  // Sequential rather than Promise.all: 33 concurrent queries on a single
  // shop's Postgres exhausts the connection pool, and a backup has no
  // deadline worth that risk.
  const tables = {} as Record<BackupTable, Record<string, unknown>[]>;
  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = await readTable(table, tenantId);
    tables[table] = rows;
    counts[table] = rows.length;
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tenantId,
    tenant: tenant as unknown as Record<string, unknown>,
    tables,
    counts,
  };
}

/** Decimal and Date survive JSON; BigInt does not. */
export const jsonReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload, jsonReplacer);
}
