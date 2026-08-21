import { describe, it, expect } from "vitest";
import "dotenv/config";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { decryptBackup } from "./backup-crypto";
import { BACKUP_TABLES } from "./backup-schema";

/**
 * Reads whatever the nightly job last wrote and checks it is a full
 * backup, not the seven-table stub it used to be.
 *
 * Skipped when no backup file is present, so the suite stays green on a
 * clean checkout — but on any machine where the job has run, this is the
 * assertion that the file on disk could actually rebuild the business.
 */
const DIR = process.env.BACKUP_LOCAL_DIR || "backups";

describe("the nightly backup file", () => {
  it("contains every table in the manifest", ({ skip }) => {
    if (!existsSync(DIR)) skip();
    // Without the key the file cannot be read at all, which is a
    // configuration state, not a failing backup.
    if (!process.env.BACKUP_ENCRYPTION_KEY) skip();
    const files = readdirSync(DIR).filter((f) => f.endsWith(".enc")).sort();
    if (files.length === 0) skip();

    const payload = JSON.parse(decryptBackup(readFileSync(`${DIR}/${files[files.length - 1]}`)));

    // The exact failure this guards: a payload carrying tenant, branches,
    // items, batches, customers, doctors and invoices — and nothing else.
    for (const table of BACKUP_TABLES) {
      expect(Object.keys(payload.tables), `missing ${table}`).toContain(table);
    }
    expect(payload.tenant).toBeTruthy();
    expect(payload.version).toBeGreaterThanOrEqual(2);

    // `counts` must describe what is actually there, since restore checks it.
    for (const [table, rows] of Object.entries(payload.tables)) {
      expect(payload.counts[table], `count mismatch on ${table}`).toBe(
        (rows as unknown[]).length
      );
    }
  });
});
