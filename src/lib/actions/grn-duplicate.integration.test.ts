import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * The duplicate-GRN guard, tested at the database level.
 *
 * The application check gives a readable message, but it is a race away
 * from being useless — two receipts submitted at once both pass it. The
 * constraint is what actually guarantees the invariant, so that is what is
 * tested here.
 */
let reachable = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; }
});
afterAll(async () => { await prisma.$disconnect(); });

const MARKER = "ZZDUPTEST";

describe("duplicate supplier invoice", () => {
  it("refuses the same invoice twice from one supplier, and allows it across two", async ({
    skip,
  }) => {
    if (!reachable) skip();
    const tenant = await prisma.tenant.findFirstOrThrow();
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id } });

    const supplierA = await prisma.supplier.create({
      data: { tenantId: tenant.id, name: `${MARKER} Supplier A` },
    });
    const supplierB = await prisma.supplier.create({
      data: { tenantId: tenant.id, name: `${MARKER} Supplier B` },
    });

    const grnFor = (supplierId: string) => ({
      tenantId: tenant.id,
      branchId: branch.id,
      supplierId,
      supplierInvoiceNo: "INV-1024",
      supplierInvoiceDate: new Date(),
      receivedByUserId: user.id,
    });

    try {
      await prisma.grn.create({ data: grnFor(supplierA.id) });

      // The same invoice number from the same supplier is the dangerous
      // case — it would double stock and double the payable.
      await expect(prisma.grn.create({ data: grnFor(supplierA.id) })).rejects.toThrow();

      // The same number from a different distributor is entirely normal.
      const other = await prisma.grn.create({ data: grnFor(supplierB.id) });
      expect(other.id).toBeTruthy();
    } finally {
      await prisma.grn.deleteMany({
        where: { supplier: { name: { startsWith: MARKER } } },
      });
      await prisma.supplier.deleteMany({
        where: { tenantId: tenant.id, name: { startsWith: MARKER } },
      });
    }
  }, 60_000);
});
