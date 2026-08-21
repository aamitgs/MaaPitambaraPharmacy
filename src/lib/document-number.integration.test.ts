import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { prisma } from "./prisma";
import { nextDocumentNumber, periodKeyFor } from "./document-number";

/**
 * The whole reason this counter exists is concurrency, so it is tested
 * concurrently. Skipped when there is no database to talk to, so a clean
 * checkout stays green.
 */
let tenantId: string | null = null;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return; // leaves tenantId null; every test skips
  }
  const tenant = await prisma.tenant.create({
    data: { pharmacyName: "__doc-number-test__" },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
});

describe("document numbering", () => {
  it("gives every concurrent caller a different number", async ({ skip }) => {
    if (!tenantId) skip();
    const period = periodKeyFor();

    // Twelve tills ringing up at once. Under the old COUNT+1 this is where
    // duplicates appeared and the unique index rejected the losers.
    const issued = await Promise.all(
      Array.from({ length: 12 }, () =>
        prisma.$transaction((tx) => nextDocumentNumber(tx, tenantId!, "INV"))
      )
    );

    expect(new Set(issued).size).toBe(12);
    expect([...issued].sort()).toEqual(
      Array.from({ length: 12 }, (_, i) =>
        `INV-${period}-${String(i + 1).padStart(4, "0")}`
      )
    );
  });

  it("keeps counters separate per prefix", async ({ skip }) => {
    if (!tenantId) skip();
    const period = periodKeyFor();
    const cn = await prisma.$transaction((tx) =>
      nextDocumentNumber(tx, tenantId!, "CN")
    );
    // INV is already at 12; CN must start at its own 1.
    expect(cn).toBe(`CN-${period}-0001`);
  });

  it("gives the number back when the sale rolls back, so the series has no holes", async ({
    skip,
  }) => {
    if (!tenantId) skip();
    const period = periodKeyFor();

    await expect(
      prisma.$transaction(async (tx) => {
        await nextDocumentNumber(tx, tenantId!, "CNT");
        throw new Error("sale abandoned");
      })
    ).rejects.toThrow("sale abandoned");

    const next = await prisma.$transaction((tx) =>
      nextDocumentNumber(tx, tenantId!, "CNT")
    );
    // 0001, not 0002: a rolled-back transaction must not burn a number.
    expect(next).toBe(`CNT-${period}-0001`);
  });

  it("scopes counters to the tenant", async ({ skip }) => {
    if (!tenantId) skip();
    const other = await prisma.tenant.create({
      data: { pharmacyName: "__doc-number-test-2__" },
    });
    try {
      const n = await prisma.$transaction((tx) =>
        nextDocumentNumber(tx, other.id, "INV")
      );
      expect(n).toBe(`INV-${periodKeyFor()}-0001`);
    } finally {
      await prisma.tenant.delete({ where: { id: other.id } });
    }
  });
});
