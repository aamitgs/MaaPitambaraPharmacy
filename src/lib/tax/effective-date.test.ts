import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { rateOn } from "./resolve";

/**
 * An effective date has to mean local midnight in the shop, not UTC.
 *
 * Prisma stores DateTime in `timestamp without time zone` as the UTC
 * instant, so a rate entered as "22 Sep 2025" is written as 21 Sep 18:30Z
 * in IST and reads back a day early in raw SQL. That is correct — it is
 * midnight on the 22nd where the shop is — but it is exactly the kind of
 * off-by-one that gets "fixed" into a real bug by someone reading the
 * column directly. This pins the behaviour that matters: which rate
 * applies on which local day.
 */
let reachable = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; }
});
afterAll(async () => { await prisma.$disconnect(); });

describe("effective dates round-trip", () => {
  it("applies a rate from local midnight of the date entered", async ({ skip }) => {
    if (!reachable) skip();

    const slab = await prisma.taxSlab.findFirst({
      where: { name: "Standard medicines" },
      include: { rates: true },
    });
    if (!slab) skip();

    const rates = slab!.rates.map((r) => ({
      rate: Number(r.rate),
      effectiveFrom: r.effectiveFrom,
    }));

    // Local-time boundaries around the GST 2.0 change entered as 22 Sep 2025.
    const lateOn21st = new Date(2025, 8, 21, 23, 59);
    const justAfterMidnightOn22nd = new Date(2025, 8, 22, 0, 1);

    expect(rateOn(rates, lateOn21st)?.rate, "still the old rate on the 21st").toBe(12);
    expect(rateOn(rates, justAfterMidnightOn22nd)?.rate, "new rate from the 22nd").toBe(5);

    // And the first rate, entered as 1 Jul 2017.
    expect(rateOn(rates, new Date(2017, 5, 30, 23, 59)), "nothing before the first rate").toBeNull();
    expect(rateOn(rates, new Date(2017, 6, 1, 0, 1))?.rate).toBe(12);
  }, 30_000);
});
