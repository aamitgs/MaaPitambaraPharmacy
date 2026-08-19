"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function dateWindow(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

export interface MarginRow {
  key: string;
  label: string;
  qtySold: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

/**
 * Margin per line is (qty * saleRate - discountAmount) - qty * the actual
 * batch's purchaseRate — the cost of the specific lot that was sold, not
 * the item's current/average purchase rate, since two batches of the same
 * item can have been bought at different rates.
 */
async function computeMarginLines(from: string, to: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

  return prisma.salesInvoiceItem.findMany({
    where: {
      invoice: {
        tenantId: session.user.tenantId,
        ...branchFilter,
        status: "completed",
        invoiceDate: { gte: fromDate, lte: toDate },
      },
    },
    select: {
      qty: true,
      rate: true,
      discountAmount: true,
      item: { select: { id: true, name: true, hsnCode: true } },
      batch: { select: { purchaseRate: true } },
    },
  });
}

function aggregate(
  lines: Awaited<ReturnType<typeof computeMarginLines>>,
  keyOf: (l: (typeof lines)[number]) => string,
  labelOf: (l: (typeof lines)[number]) => string
): MarginRow[] {
  const groups = new Map<string, MarginRow>();
  for (const line of lines) {
    const key = keyOf(line);
    const revenue = line.qty * Number(line.rate) - Number(line.discountAmount);
    const cost = line.qty * Number(line.batch.purchaseRate);
    const margin = revenue - cost;

    const existing = groups.get(key);
    if (existing) {
      existing.qtySold += line.qty;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.margin += margin;
    } else {
      groups.set(key, { key, label: labelOf(line), qtySold: line.qty, revenue, cost, margin, marginPercent: 0 });
    }
  }
  return Array.from(groups.values())
    .map((r) => ({
      ...r,
      revenue: round2(r.revenue),
      cost: round2(r.cost),
      margin: round2(r.margin),
      marginPercent: r.revenue > 0 ? round2((r.margin / r.revenue) * 100) : 0,
    }))
    .sort((a, b) => b.margin - a.margin);
}

export interface MarginReport {
  byItem: MarginRow[];
  byHsn: MarginRow[];
}

/**
 * "Category" doesn't exist as a field on Item in this schema — HSN code is
 * the closest existing grouping dimension (already used for GST reporting
 * elsewhere), so it stands in for category-level margin here.
 */
export async function getMarginReport(from: string, to: string): Promise<MarginReport> {
  const lines = await computeMarginLines(from, to);
  return {
    byItem: aggregate(
      lines,
      (l) => l.item.id,
      (l) => l.item.name
    ),
    byHsn: aggregate(
      lines,
      (l) => l.item.hsnCode || "—",
      (l) => l.item.hsnCode || "—"
    ),
  };
}

export interface MoverRow {
  itemId: string;
  itemName: string;
  unit: string;
  qtySold: number;
  isSlowMover: boolean;
  hasNearExpiry: boolean;
}

/**
 * Ranked by qty sold in the period. Includes items with stock but zero
 * sales (the clearest slow movers) by starting from current stock, not
 * from sales — a query that only looked at SalesInvoiceItem would never
 * surface an item that didn't sell at all.
 */
export async function getMoverReport(from: string, to: string, thresholdQty: number): Promise<MoverRow[]> {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;
  const branchFilter = await getBranchFilter(tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

  const [items, tenant] = await Promise.all([
    prisma.item.findMany({
      where: { tenantId, batches: { some: { ...branchFilter, currentQty: { gt: 0 } } } },
      select: {
        id: true,
        name: true,
        unit: true,
        batches: { where: { ...branchFilter, currentQty: { gt: 0 } }, select: { expiryDate: true } },
      },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);

  const salesByItem = await prisma.salesInvoiceItem.groupBy({
    by: ["itemId"],
    where: {
      invoice: {
        tenantId,
        ...branchFilter,
        status: "completed",
        invoiceDate: { gte: fromDate, lte: toDate },
      },
    },
    _sum: { qty: true },
  });
  const soldMap = new Map(salesByItem.map((s) => [s.itemId, s._sum.qty ?? 0]));

  const now = new Date();
  const nearExpiryCutoff = new Date(now.getTime() + tenant.nearExpiryWindowDays * 86400000);

  const rows: MoverRow[] = items.map((item) => {
    const qtySold = soldMap.get(item.id) ?? 0;
    const hasNearExpiry = item.batches.some((b) => b.expiryDate <= nearExpiryCutoff);
    return {
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      qtySold,
      isSlowMover: qtySold < thresholdQty,
      hasNearExpiry,
    };
  });

  rows.sort((a, b) => b.qtySold - a.qtySold);
  return rows;
}
