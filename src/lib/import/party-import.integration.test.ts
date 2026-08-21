import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { readTabularFile } from "./read-file";
import { validatePartyRows, fieldsFor, type PartyRow, type PartyFieldKey } from "./party-fields";

/**
 * The supplier import, end to end from a real .xlsx through parsing,
 * column mapping and validation — the same steps the panel performs — and
 * then written to the database and cleaned up.
 *
 * The UI harness could not fire React's file-change event reliably, so
 * this exercises the pipeline directly rather than leaving it unverified.
 */
let reachable = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; }
});
afterAll(async () => { await prisma.$disconnect(); });

const MARKER = "ZZTEST";

async function buildFile(): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["SUPPLIER MASTER — AUGUST 2026"]);
  ws.addRow([]);
  ws.addRow(["Name", "GSTIN", "Address", "Payment terms (days)"]);
  ws.addRow([`${MARKER} Agra Pharma`, "09AAACP1234C1ZV", "Sanjay Place, Agra", 30]);
  ws.addRow([`${MARKER} Yamuna Medical`, "09AABCY5678D1ZP", "Belanganj, Agra", 45]);
  ws.addRow([`${MARKER} Taj Healthcare`, "", "Fatehabad Road, Agra", 15]);
  ws.addRow([`${MARKER} Bad Row`, "NOT-A-GSTIN", "", 7]);
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf as ArrayBuffer], "suppliers.xlsx");
}

const guess = (headers: string[], key: string, label: string) => {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return headers.find((h) => [norm(key), norm(label)].includes(norm(h)));
};

describe("supplier import, end to end", () => {
  it("parses, maps, validates and writes", async ({ skip }) => {
    if (!reachable) skip();
    const tenant = await prisma.tenant.findFirstOrThrow();

    const { headers, rows } = await readTabularFile(await buildFile());
    expect(headers).toEqual(["Name", "GSTIN", "Address", "Payment terms (days)"]);
    expect(rows).toHaveLength(4);

    // Auto-mapping, exactly as the panel does it.
    const fields = fieldsFor("supplier");
    const mapping: Partial<Record<PartyFieldKey, string>> = {};
    for (const f of fields) {
      const col = guess(headers, f.key, f.label);
      if (col) mapping[f.key] = col;
    }
    expect(mapping.name).toBe("Name");
    expect(mapping.gstin).toBe("GSTIN");
    expect(mapping.paymentTermsDays).toBe("Payment terms (days)");

    const mapped: PartyRow[] = rows.map((row) => {
      const out: PartyRow = {};
      for (const f of fields) {
        const col = mapping[f.key];
        if (col) out[f.key] = row[col] ?? "";
      }
      return out;
    });

    const validated = validatePartyRows("supplier", mapped, new Set());
    const good = validated.filter((r) => r.errors.length === 0);
    const bad = validated.filter((r) => r.errors.length > 0);
    // The malformed GSTIN row is caught; the other three go through.
    expect(good).toHaveLength(3);
    expect(bad).toHaveLength(1);
    expect(bad[0].errors.join(" ")).toMatch(/GSTIN/);

    try {
      for (const row of good) {
        await prisma.supplier.create({
          data: {
            tenantId: tenant.id,
            name: row.raw.name!.trim(),
            gstin: row.raw.gstin?.trim() || undefined,
            address: row.raw.address?.trim() || undefined,
            paymentTermsDays: row.raw.paymentTermsDays
              ? Number(row.raw.paymentTermsDays)
              : undefined,
          },
        });
      }

      const written = await prisma.supplier.findMany({
        where: { tenantId: tenant.id, name: { startsWith: MARKER } },
        orderBy: { name: "asc" },
      });
      expect(written).toHaveLength(3);
      // Numbers survive the spreadsheet round trip as numbers.
      expect(written.find((s) => s.name.includes("Agra"))?.paymentTermsDays).toBe(30);
      expect(written.find((s) => s.name.includes("Taj"))?.gstin).toBeNull();

      // Re-running matches on name rather than duplicating.
      const existing = new Set(written.map((s) => s.name.toLowerCase()));
      const second = validatePartyRows("supplier", mapped, existing);
      expect(second.filter((r) => r.action === "update")).toHaveLength(3);
    } finally {
      await prisma.supplier.deleteMany({
        where: { tenantId: tenant.id, name: { startsWith: MARKER } },
      });
    }
  }, 120_000);
});
