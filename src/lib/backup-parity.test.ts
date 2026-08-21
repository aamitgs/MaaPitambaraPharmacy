import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BACKUP_TABLES } from "./backup-schema";

/**
 * The manual backup and the nightly one must be the same backup.
 *
 * They were not: the scheduled route hand-listed seven tables while the
 * manual export covered the full manifest, so the unattended nightly
 * backup silently dropped most of the business and still logged success.
 * Nothing in the type system prevents that from happening again — both
 * paths compile fine — so it is asserted here instead.
 */
const ROUTE = "src/app/api/backup/scheduled/route.ts";

describe("scheduled backup parity", () => {
  const source = readFileSync(ROUTE, "utf8");

  it("builds its payload with the shared builder", () => {
    expect(source).toContain("gatherTenantData");
    expect(source).toContain("serializeBackup");
  });

  it("does not query tables directly, which is how the two drifted apart", () => {
    // Any `prisma.<model>.findMany` in this route means it has started
    // assembling its own idea of what a backup contains. The only prisma
    // calls it legitimately needs are the tenant list and the backup log.
    const directReads = [...source.matchAll(/prisma\.(\w+)\.findMany/g)].map((m) => m[1]);
    expect(directReads).toEqual(["tenant"]);
  });

  it("still writes a backup log and reports failure to the caller", () => {
    expect(source).toContain("backupLog.create");
    // A scheduler that only ever sees 200 cannot alert anyone.
    expect(source).toMatch(/status:\s*allOk\s*\?\s*200\s*:\s*500/);
  });

  it("covers a manifest that is not trivially small", () => {
    // Guards against someone "simplifying" BACKUP_TABLES back down.
    expect(BACKUP_TABLES.length).toBeGreaterThan(30);
  });
});
