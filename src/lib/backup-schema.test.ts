import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BACKUP_TABLES, BACKUP_EXCLUSIONS } from "./backup-schema";
import { TABLE_SPECS } from "./backup-tables";

/**
 * The guard that makes a forgotten table loud.
 *
 * The original backup exported six of thirty-four models and reported
 * "success" — the failure mode is silence, so the only useful test is one
 * that fails when the schema grows and the manifest doesn't.
 */
describe("backup manifest", () => {
  const schema = readFileSync(
    path.join(process.cwd(), "prisma", "schema.prisma"),
    "utf8"
  );
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);

  it("finds the models in the schema", () => {
    expect(models.length).toBeGreaterThan(30);
  });

  it("covers every model, or documents why not", () => {
    // Map a Prisma delegate name back to its model name: Prisma lowercases
    // only the first character, so WhatsAppLog -> whatsAppLog.
    const covered = new Set(Object.values(TABLE_SPECS).map((s) => s.model));
    const uncovered = models.filter((model) => {
      const delegate = model[0].toLowerCase() + model.slice(1);
      return !covered.has(delegate) && !(model in BACKUP_EXCLUSIONS);
    });

    expect(
      uncovered,
      `These models are in schema.prisma but not in BACKUP_TABLES, so a backup would ` +
        `silently omit them. Add them to src/lib/backup-schema.ts (and a spec in ` +
        `backup-tables.ts), or record why they are excluded in BACKUP_EXCLUSIONS.`
    ).toEqual([]);
  });

  it("has a spec for every declared table", () => {
    for (const table of BACKUP_TABLES) {
      expect(TABLE_SPECS[table], `no spec for ${table}`).toBeDefined();
    }
  });

  it("lists parents before the rows that reference them", () => {
    // The dependency graph is read out of schema.prisma rather than typed
    // here by hand. A hand-written list only catches the violations someone
    // thought of; this catches every foreign key that exists, including the
    // ones added next year.
    const delegateOf = (model: string) => model[0].toLowerCase() + model.slice(1);
    const tableOfDelegate = new Map(
      Object.entries(TABLE_SPECS).map(([table, spec]) => [spec.model, table])
    );

    const position = new Map(BACKUP_TABLES.map((t, i) => [t as string, i]));
    const violations: string[] = [];

    for (const [, name, body] of [
      ...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm),
    ].map((m) => [m[0], m[1], m[2]] as const)) {
      const childTable = tableOfDelegate.get(delegateOf(name));
      if (childTable === undefined) continue;

      for (const line of body.split("\n")) {
        if (!line.includes("@relation(fields:")) continue;
        const parts = line.trim().split(/\s+/);
        const parentModel = parts[1]?.replace(/[?[\]]/g, "");
        if (!parentModel) continue;

        // Tenant is restored ahead of everything, outside the loop.
        if (parentModel === "Tenant") continue;
        const parentTable = tableOfDelegate.get(delegateOf(parentModel));
        if (parentTable === undefined) continue;
        // A self-reference cannot be ordered around.
        if (parentTable === childTable) continue;

        if (position.get(parentTable)! > position.get(childTable)!) {
          violations.push(`${childTable} references ${parentTable}, but is restored first`);
        }
      }
    }

    expect(
      [...new Set(violations)],
      "BACKUP_TABLES must be in foreign-key order — a child cannot be inserted " +
        "before the row it points at, so a restore in this order would fail."
    ).toEqual([]);
  });

  it("has no duplicate entries", () => {
    expect(new Set(BACKUP_TABLES).size).toBe(BACKUP_TABLES.length);
  });
});
