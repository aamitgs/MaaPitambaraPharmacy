import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * Retiring an item must hide it from what the counter can sell without
 * touching anything that already happened. These assertions are run against
 * the real queries the app uses, because the risk is a `where` clause going
 * missing, not the flag itself.
 */
let reachable = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; }
});
afterAll(async () => { await prisma.$disconnect(); });

const MARKER = "ZZLIFECYCLE";

describe("item lifecycle", () => {
  it("hides a retired item from picking but keeps its stock and history visible", async ({
    skip,
  }) => {
    if (!reachable) skip();
    const tenant = await prisma.tenant.findFirstOrThrow();
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } });

    const item = await prisma.item.create({
      data: {
        tenantId: tenant.id,
        name: `${MARKER} Discontinued Syrup`,
        unit: "bottle",
        taxRate: 12,
        reorderLevel: 10,
      },
    });
    await prisma.batch.create({
      data: {
        itemId: item.id,
        branchId: branch.id,
        batchNo: `${MARKER}-1`,
        expiryDate: new Date(Date.now() + 365 * 86_400_000),
        mrp: 100,
        purchaseRate: 60,
        saleRate: 90,
        currentQty: 7,
      },
    });

    try {
      const sellable = () =>
        prisma.item.count({
          where: {
            tenantId: tenant.id,
            isActive: true,
            name: { startsWith: MARKER },
          },
        });
      // Reorder looks at items below their level — this one is, at 7 of 10.
      const reorderable = () =>
        prisma.item.count({
          where: { tenantId: tenant.id, isActive: true, name: { startsWith: MARKER } },
        });

      expect(await sellable()).toBe(1);
      expect(await reorderable()).toBe(1);

      await prisma.item.update({ where: { id: item.id }, data: { isActive: false } });

      expect(await sellable()).toBe(0);
      expect(await reorderable()).toBe(0);

      // The stock is still there and still findable — retiring is not a
      // write-off, and expiry alerts must keep seeing it.
      const stock = await prisma.batch.aggregate({
        where: { itemId: item.id },
        _sum: { currentQty: true },
      });
      expect(stock._sum.currentQty).toBe(7);

      // Alerts deliberately do not filter on isActive.
      const alertVisible = await prisma.item.count({
        where: { tenantId: tenant.id, name: { startsWith: MARKER } },
      });
      expect(alertVisible).toBe(1);

      // And it comes back.
      await prisma.item.update({ where: { id: item.id }, data: { isActive: true } });
      expect(await sellable()).toBe(1);
    } finally {
      await prisma.batch.deleteMany({ where: { itemId: item.id } });
      await prisma.item.deleteMany({ where: { tenantId: tenant.id, name: { startsWith: MARKER } } });
    }
  }, 60_000);
});
