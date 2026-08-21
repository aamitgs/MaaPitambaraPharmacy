import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { BACKUP_TABLES } from "@/lib/backup-schema";
import { readTable } from "@/lib/backup-tables";
import { buildWorkbook, type Sheet } from "@/lib/xlsx";
import { redactValue, cellValue, type RedactionMode } from "@/lib/data-workbook";

/**
 * Builds the readable data workbook exactly as the route does, against the
 * real database, and checks what actually lands in the cells.
 *
 * Unit tests already cover the redaction rules. What this proves is the
 * thing that would actually hurt: that no password hash, PIN or MFA secret
 * reaches a plain file — verified by scanning every cell of every sheet
 * rather than by trusting the rule list.
 */
let reachable = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; }
});
afterAll(async () => { await prisma.$disconnect(); });

async function build(tenantId: string, mode: RedactionMode) {
  const sheets: Sheet<Record<string, unknown>>[] = [];
  for (const table of BACKUP_TABLES) {
    const rows = await readTable(table, tenantId);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : ["(no rows)"];
    sheets.push({
      name: table,
      columns: columns.map((c) => ({
        header: c,
        key: (row: Record<string, unknown>) => cellValue(redactValue(table, c, row[c], mode)),
        type: "text" as const,
      })),
      rows,
    });
  }
  const buf = await buildWorkbook(sheets, { title: "t", pharmacy: "Test" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

const allCells = (wb: ExcelJS.Workbook) => {
  const out: string[] = [];
  wb.eachSheet((ws) =>
    ws.eachRow((row) =>
      (row.values as unknown[]).forEach((v) => {
        if (v !== null && v !== undefined) out.push(String(v));
      })
    )
  );
  return out;
};

describe("data workbook, built from real data", () => {
  it("never writes a credential into any cell, in either mode", async ({ skip }) => {
    if (!reachable) skip();
    const tenant = await prisma.tenant.findFirstOrThrow();

    // The actual secrets in this database, to search the file for.
    const users = await prisma.user.findMany({
      select: { passwordHash: true, totpSecret: true },
    });
    const secrets = [
      ...users.map((u) => u.passwordHash),
      ...users.map((u) => u.totpSecret),
      (await prisma.tenant.findFirstOrThrow({ select: { managerPinHash: true } }))
        .managerPinHash,
    ].filter((s): s is string => Boolean(s) && String(s).length > 8);

    expect(secrets.length, "there should be secrets to look for").toBeGreaterThan(0);

    for (const mode of ["redacted", "full"] as RedactionMode[]) {
      const cells = allCells(await build(tenant.id, mode));
      for (const secret of secrets) {
        expect(
          cells.some((c) => c.includes(secret)),
          `a credential leaked into the ${mode} workbook`
        ).toBe(false);
      }
    }
  }, 180_000);

  it("redacts patient details by default and includes them when asked", async ({ skip }) => {
    if (!reachable) skip();
    const tenant = await prisma.tenant.findFirstOrThrow();

    const withPatient = await prisma.salesInvoice.findFirst({
      where: { tenantId: tenant.id, patientName: { not: null } },
      select: { patientName: true },
    });
    if (!withPatient?.patientName) skip();

    const redacted = allCells(await build(tenant.id, "redacted"));
    expect(redacted).toContain("[redacted]");
    expect(redacted.some((c) => c === withPatient!.patientName)).toBe(false);

    const full = allCells(await build(tenant.id, "full"));
    expect(full.some((c) => c === withPatient!.patientName)).toBe(true);
  }, 180_000);

  it("gives every table a sheet, so an empty one is visible not missing", async ({ skip }) => {
    if (!reachable) skip();
    const tenant = await prisma.tenant.findFirstOrThrow();
    const wb = await build(tenant.id, "redacted");
    // Sheet names are truncated to 31 chars by Excel, so compare prefixes.
    const names = wb.worksheets.map((w) => w.name);
    for (const table of BACKUP_TABLES) {
      expect(names.some((n) => n === table.slice(0, 31)), `missing sheet for ${table}`).toBe(true);
    }
  }, 180_000);
});
