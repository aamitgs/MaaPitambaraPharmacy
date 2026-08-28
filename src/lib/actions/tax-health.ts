"use server";

import { prisma } from "@/lib/prisma";
import { localDateWindow } from "@/lib/date-range";
import { requirePermission } from "@/lib/rbac";
import { resolveTaxRate, isMixedRateHsn, mixedRateReason } from "@/lib/tax/resolve";
import { loadTaxContext } from "@/lib/tax/context";

/**
 * What would embarrass you at filing time.
 *
 * Every check here answers a question an auditor or the portal will ask
 * eventually; the point of running it beforehand is that the answers are
 * still cheap to fix. Read-only.
 */

export type TaxFinding = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  count: number;
  /** A few concrete examples, so the fix is findable. */
  examples: { id: string; label: string; href?: string }[];
};

export async function getTaxHealth(from: string, to: string): Promise<TaxFinding[]> {
  const session = await requirePermission("compliance.manage");
  const tenantId = session.user.tenantId;
  const findings: TaxFinding[] = [];

  const { fromDate, toDate } = localDateWindow(from, to);

  const [items, ctx, slabs] = await Promise.all([
    prisma.item.findMany({
      where: { tenantId },
      select: { id: true, name: true, hsnCode: true, taxSlabId: true, taxRate: true },
      orderBy: { name: "asc" },
    }),
    loadTaxContext(tenantId),
    prisma.taxSlab.findMany({
      where: { tenantId, isActive: true },
      include: { rates: true },
    }),
  ]);

  const now = new Date();

  // 1. HSN is mandatory on a tax invoice under Rule 46.
  const noHsn = items.filter((i) => !i.hsnCode?.trim());
  if (noHsn.length > 0) {
    findings.push({
      id: "missing-hsn",
      severity: "critical",
      title: "Items with no HSN code",
      detail:
        "Rule 46 requires the HSN on a tax invoice, and GSTR-1 Table 12 is summarised by it. These items are being billed and reported without one.",
      count: noHsn.length,
      examples: noHsn.slice(0, 5).map((i) => ({
        id: i.id,
        label: i.name,
        href: `/items/${i.id}/edit`,
      })),
    });
  }

  // 2. Items still relying on the pre-slab column.
  const unclassified = items.filter((i) => {
    const r = resolveTaxRate({
      itemSlabId: i.taxSlabId,
      hsnCode: i.hsnCode,
      legacyTaxRate: Number(i.taxRate),
      ...ctx,
      asOf: now,
    });
    return r.source === "legacy-item-rate" || r.source === "none";
  });
  if (unclassified.length > 0) {
    findings.push({
      id: "unclassified",
      severity: "warning",
      title: "Items not on a GST slab",
      detail:
        "These bill at whatever rate was typed on the item, so a future rate change will not reach them. Assign a slab, or map their HSN code to one.",
      count: unclassified.length,
      examples: unclassified.slice(0, 5).map((i) => ({
        id: i.id,
        label: `${i.name} — ${Number(i.taxRate)}%`,
        href: `/items/${i.id}/edit`,
      })),
    });
  }

  // 3. Items taking their rate from an HSN chapter that is not uniform.
  //    The mapping gave them the majority rate; whether that is right for
  //    this particular product is a judgement no mapping can make.
  const onMixedChapter = items.filter((i) => {
    if (!isMixedRateHsn(i.hsnCode)) return false;
    // An explicit slab on the item means somebody has already decided.
    if (i.taxSlabId) return false;
    const r = resolveTaxRate({
      itemSlabId: i.taxSlabId,
      hsnCode: i.hsnCode,
      legacyTaxRate: Number(i.taxRate),
      ...ctx,
      asOf: now,
    });
    return r.source === "hsn-slab";
  });
  if (onMixedChapter.length > 0) {
    findings.push({
      id: "mixed-hsn",
      severity: "warning",
      title: "Items on an HSN chapter that carries more than one rate",
      detail:
        "These took the chapter's default rate. That is right for most of the chapter and wrong for specific lines in it — set a slab on the item itself where it differs. " +
        [...new Set(onMixedChapter.map((i) => mixedRateReason(i.hsnCode)).filter(Boolean))].join(" "),
      count: onMixedChapter.length,
      examples: onMixedChapter.slice(0, 5).map((i) => ({
        id: i.id,
        label: `${i.name} — HSN ${i.hsnCode}`,
        href: `/items/${i.id}/edit`,
      })),
    });
  }

  // 4. A slab whose rate has not started yet bills at its fallback, which
  //    is almost never what was intended.
  const slabsWithoutCurrentRate = slabs.filter(
    (s) => !s.rates.some((r) => r.effectiveFrom <= now)
  );
  if (slabsWithoutCurrentRate.length > 0) {
    findings.push({
      id: "slab-no-rate",
      severity: "critical",
      title: "Slabs with no rate in force",
      detail:
        "Items on these slabs fall through to their old item rate. Add a rate with an effective date on or before today.",
      count: slabsWithoutCurrentRate.length,
      examples: slabsWithoutCurrentRate.slice(0, 5).map((s) => ({
        id: s.id,
        label: s.name,
        href: "/tax-slabs",
      })),
    });
  }

  // 5. Invoices charged at a rate the master would not produce today.
  //    Expected after a genuine rate change — the historical rate is
  //    correct and must not be "fixed" — so this is reported for review
  //    rather than as an error.
  const lines = await prisma.salesInvoiceItem.findMany({
    where: {
      invoice: { tenantId, status: "completed", invoiceDate: { gte: fromDate, lte: toDate } },
    },
    select: {
      id: true,
      taxRate: true,
      invoice: { select: { invoiceNo: true, id: true, invoiceDate: true } },
      item: { select: { id: true, name: true, hsnCode: true, taxSlabId: true, taxRate: true } },
    },
  });

  const drifted = lines.filter((l) => {
    // Resolved as of the invoice's own date, not today — comparing a 2024
    // invoice against today's rate would flag every line as wrong.
    const expected = resolveTaxRate({
      itemSlabId: l.item.taxSlabId,
      hsnCode: l.item.hsnCode,
      legacyTaxRate: Number(l.item.taxRate),
      ...ctx,
      asOf: l.invoice.invoiceDate,
    });
    return Number(l.taxRate) !== expected.rate;
  });

  if (drifted.length > 0) {
    const byInvoice = new Map<string, { invoiceNo: string; id: string }>();
    for (const l of drifted) byInvoice.set(l.invoice.id, { invoiceNo: l.invoice.invoiceNo, id: l.invoice.id });
    findings.push({
      id: "rate-drift",
      severity: "warning",
      title: "Invoices charged at a rate the master no longer produces",
      detail:
        "The rate stored on the bill is what was charged and stays as it is. Check these are explained by a rate change and not a misclassification — if an item was on the wrong slab, the fix is a credit note, not an edit.",
      count: drifted.length,
      examples: [...byInvoice.values()].slice(0, 5).map((i) => ({
        id: i.id,
        label: i.invoiceNo,
        href: `/invoices/${i.id}/receipt`,
      })),
    });
  }

  const order = { critical: 0, warning: 1 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
