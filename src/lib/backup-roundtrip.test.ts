import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { encryptBackup, decryptBackup } from "@/lib/backup-crypto";
import { BACKUP_TABLES, BACKUP_VERSION } from "@/lib/backup-schema";
import {
  readTable,
  countTable,
  writeTable,
  clearTable,
  RESTORE_ORDER,
  DELETE_ORDER,
} from "@/lib/backup-tables";

/**
 * Round-trips a real backup against a real database: export every table,
 * encrypt, decrypt, then run a full REPLACE restore inside a transaction
 * that is deliberately rolled back.
 *
 * The rollback is what makes this safe to run against live data, and the
 * restore-inside-a-transaction is the only way to prove the delete order
 * and the foreign-key insert order actually hold — a unit test on the
 * manifest can prove they are consistent, not that Postgres accepts them.
 *
 * Skipped when no database is reachable, so `npm test` still passes on a
 * machine that has only checked the repo out.
 */
let reachable = false;
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    reachable = true;
  } catch {
    reachable = false;
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("backup round trip", () => {
  it("exports every table, and a replace-restore puts back exactly what it took", async ({
    skip,
  }) => {
    if (!reachable) skip();

    const tenant = await prisma.tenant.findFirstOrThrow();
    const tenantId = tenant.id;

    const tables: Record<string, Record<string, unknown>[]> = {};
    const counts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      const rows = await readTable(t, tenantId);
      tables[t] = rows;
      counts[t] = rows.length;
    }

    // What the export captured must equal a direct COUNT(*) — this is the
    // check the original six-table backup would have failed.
    for (const t of BACKUP_TABLES) {
      expect(counts[t], `${t} export count`).toBe(await countTable(t, tenantId));
    }

    const payload = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tenantId,
      tenant,
      tables,
      counts,
    };
    const encrypted = encryptBackup(
      JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    );
    const decoded = JSON.parse(decryptBackup(encrypted));

    expect(decoded.version).toBe(BACKUP_VERSION);
    expect(decoded.tenantId).toBe(tenantId);
    for (const t of BACKUP_TABLES) {
      expect(decoded.tables[t]?.length ?? 0, `${t} survived encryption`).toBe(decoded.counts[t]);
    }

    const totalExported = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(totalExported).toBeGreaterThan(0);

    class Rollback extends Error {}
    let totalRestored = 0;
    let invoicesInTx = -1;

    try {
      await prisma.$transaction(
        async (tx) => {
          for (const t of DELETE_ORDER) await clearTable(tx, t, tenantId);
          const { id: _id, createdAt: _createdAt, ...fields } = decoded.tenant;
          await tx.tenant.update({ where: { id: tenantId }, data: fields });
          for (const t of RESTORE_ORDER) {
            totalRestored += await writeTable(tx, t, decoded.tables[t] ?? []);
          }
          invoicesInTx = await tx.salesInvoice.count({ where: { tenantId } });
          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 20_000 }
      );
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }

    // Nothing lost: every row that came out went back in.
    expect(totalRestored, "rows restored vs exported").toBe(totalExported);
    expect(invoicesInTx).toBe(counts.salesInvoices);

    // And the rollback left the live data exactly as it was.
    expect(await prisma.salesInvoice.count({ where: { tenantId } })).toBe(counts.salesInvoices);
    expect(await prisma.item.count({ where: { tenantId } })).toBe(counts.items);
  }, 180_000);
});
