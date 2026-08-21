import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { planRedaction, REDACTED } from "@/lib/retention";

/**
 * The redaction's one non-negotiable invariant: the accounting record must
 * come through untouched. If clearing patient details changed a single
 * total, every GST return already filed would stop reconciling.
 */
let reachable = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; }
});
afterAll(async () => { await prisma.$disconnect(); });

describe("retention redaction", () => {
  it("clears details on old bills only, and changes no money", async ({ skip }) => {
    if (!reachable) skip();
    const tenant = await prisma.tenant.findFirstOrThrow();

    const totalsBefore = await prisma.salesInvoice.aggregate({
      where: { tenantId: tenant.id },
      _sum: { subtotal: true, taxAmount: true, total: true },
      _count: { _all: true },
    });

    const plan = planRedaction(6);
    if (!plan.redact) throw new Error(plan.reason);

    const personalWhere = {
      OR: [
        { patientName: { not: null } },
        { patientPhone: { not: null } },
        { patientAddress: { not: null } },
        { patientAge: { not: null } },
        { prescriptionImageUrl: { not: null } },
      ],
    };

    const oldOnes = await prisma.salesInvoice.findMany({
      where: { tenantId: tenant.id, invoiceDate: { lt: plan.cutoff }, ...personalWhere },
      select: { id: true, patientName: true, patientPhone: true, invoiceDate: true, total: true },
    });
    const recentOnes = await prisma.salesInvoice.findMany({
      where: { tenantId: tenant.id, invoiceDate: { gte: plan.cutoff }, ...personalWhere },
      select: { id: true, patientName: true },
    });

    // Nothing to prove if the fixture has no bill on each side of the line.
    if (oldOnes.length === 0 || recentOnes.length === 0) skip();

    // Run inside a rolled-back transaction so the real data is untouched.
    await prisma
      .$transaction(async (tx) => {
        const { count } = await tx.salesInvoice.updateMany({
          where: { tenantId: tenant.id, invoiceDate: { lt: plan.cutoff }, ...personalWhere },
          data: {
            patientName: REDACTED,
            patientAge: null,
            patientPhone: null,
            patientAddress: null,
            prescriptionImageUrl: null,
          },
        });
        expect(count).toBe(oldOnes.length);

        const after = await tx.salesInvoice.findMany({
          where: { id: { in: oldOnes.map((i) => i.id) } },
          select: { patientName: true, patientPhone: true, patientAddress: true, patientAge: true, prescriptionImageUrl: true, total: true, invoiceDate: true },
        });
        for (const inv of after) {
          expect(inv.patientName).toBe(REDACTED);
          expect(inv.patientPhone).toBeNull();
          expect(inv.patientAddress).toBeNull();
          expect(inv.patientAge).toBeNull();
          expect(inv.prescriptionImageUrl).toBeNull();
        }

        // Recent bills keep their details — the cutoff is a cutoff.
        const untouched = await tx.salesInvoice.findMany({
          where: { id: { in: recentOnes.map((i) => i.id) } },
          select: { id: true, patientName: true },
        });
        for (const inv of untouched) {
          const original = recentOnes.find((r) => r.id === inv.id);
          expect(inv.patientName).toBe(original?.patientName);
        }

        // And the money is identical, to the paisa.
        const totalsAfter = await tx.salesInvoice.aggregate({
          where: { tenantId: tenant.id },
          _sum: { subtotal: true, taxAmount: true, total: true },
          _count: { _all: true },
        });
        expect(totalsAfter._count._all).toBe(totalsBefore._count._all);
        expect(Number(totalsAfter._sum.subtotal)).toBe(Number(totalsBefore._sum.subtotal));
        expect(Number(totalsAfter._sum.taxAmount)).toBe(Number(totalsBefore._sum.taxAmount));
        expect(Number(totalsAfter._sum.total)).toBe(Number(totalsBefore._sum.total));

        throw new Error("ROLLBACK");
      })
      .catch((e) => {
        if (!(e instanceof Error) || e.message !== "ROLLBACK") throw e;
      });

    // Belt and braces: the real rows still hold their details.
    const stillThere = await prisma.salesInvoice.findFirst({
      where: { id: oldOnes[0].id },
      select: { patientName: true },
    });
    expect(stillThere?.patientName).toBe(oldOnes[0].patientName);
  }, 60_000);
});
