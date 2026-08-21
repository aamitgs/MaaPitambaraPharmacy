"use server";

import { prisma } from "@/lib/prisma";
import { localDateWindow } from "@/lib/date-range";
import { requirePermission } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import type { DiscountType } from "@/generated/prisma/client";

function dateWindow(from: string, to: string) {
  const { fromDate, toDate } = localDateWindow(from, to);
  return { fromDate, toDate };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface DiscountByDay {
  date: string;
  amount: number;
}

export interface DiscountByStaff {
  userId: string;
  userName: string;
  amount: number;
  count: number;
}

export interface DiscountByItem {
  itemId: string;
  itemName: string;
  amount: number;
}

export interface DiscountByType {
  type: DiscountType;
  amount: number;
  count: number;
}

export interface DiscountByScheme {
  schemeId: string;
  schemeName: string;
  amount: number;
}

export interface DiscountReport {
  total: number;
  byDay: DiscountByDay[];
  byStaff: DiscountByStaff[];
  byItem: DiscountByItem[];
  byType: DiscountByType[];
  byScheme: DiscountByScheme[];
}

export interface DiscountLine {
  date: string;
  staffName: string;
  itemName: string | null;
  type: DiscountType;
  amount: number;
}

/** Flat, unaggregated discount rows — what the CSV export offers, since a pivot elsewhere benefits more from raw rows than pre-summed tables. */
export async function getDiscountLines(from: string, to: string): Promise<DiscountLine[]> {
  const session = await requirePermission("reports.view");
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

  const discounts = await prisma.discount.findMany({
    where: {
      tenantId: session.user.tenantId,
      invoice: { ...branchFilter, status: "completed", invoiceDate: { gte: fromDate, lte: toDate } },
    },
    select: {
      type: true,
      amount: true,
      appliedBy: { select: { name: true } },
      invoice: { select: { invoiceDate: true } },
      invoiceItem: { select: { item: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return discounts
    .filter((d) => Number(d.amount) > 0)
    .map((d) => ({
      date: d.invoice.invoiceDate.toISOString().slice(0, 10),
      staffName: d.appliedBy.name,
      itemName: d.invoiceItem?.item.name ?? null,
      type: d.type,
      amount: round2(Number(d.amount)),
    }));
}

/**
 * Sums Discount.amount (the actual rupee amount applied, not the raw
 * percent/flat rate that was entered) across every discount type — item,
 * bill, scheme, loyalty, coupon — so an owner can see total margin leakage
 * from discounting, broken down the ways that matter: who gave it, what it
 * was on, when, and what kind. "By item" only includes discount rows tied
 * to a specific invoice line (item/scheme) — bill/loyalty/coupon discounts
 * apply to the whole sale, not one item, so they're excluded from that cut.
 */
export async function getDiscountReport(from: string, to: string): Promise<DiscountReport> {
  const session = await requirePermission("reports.view");
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

  const discounts = await prisma.discount.findMany({
    where: {
      tenantId: session.user.tenantId,
      invoice: { ...branchFilter, status: "completed", invoiceDate: { gte: fromDate, lte: toDate } },
    },
    select: {
      type: true,
      amount: true,
      appliedBy: { select: { id: true, name: true } },
      invoice: { select: { invoiceDate: true } },
      invoiceItem: { select: { item: { select: { id: true, name: true } } } },
      scheme: { select: { id: true, name: true } },
    },
  });

  let total = 0;
  const byDayMap = new Map<string, number>();
  const byStaffMap = new Map<string, DiscountByStaff>();
  const byItemMap = new Map<string, DiscountByItem>();
  const byTypeMap = new Map<DiscountType, DiscountByType>();
  const bySchemeMap = new Map<string, DiscountByScheme>();

  for (const d of discounts) {
    const amount = Number(d.amount);
    if (amount <= 0) continue;
    total += amount;

    const dayKey = d.invoice.invoiceDate.toISOString().slice(0, 10);
    byDayMap.set(dayKey, (byDayMap.get(dayKey) ?? 0) + amount);

    const staff = byStaffMap.get(d.appliedBy.id) ?? {
      userId: d.appliedBy.id,
      userName: d.appliedBy.name,
      amount: 0,
      count: 0,
    };
    staff.amount += amount;
    staff.count += 1;
    byStaffMap.set(d.appliedBy.id, staff);

    if (d.invoiceItem?.item) {
      const item = byItemMap.get(d.invoiceItem.item.id) ?? {
        itemId: d.invoiceItem.item.id,
        itemName: d.invoiceItem.item.name,
        amount: 0,
      };
      item.amount += amount;
      byItemMap.set(d.invoiceItem.item.id, item);
    }

    const type = byTypeMap.get(d.type) ?? { type: d.type, amount: 0, count: 0 };
    type.amount += amount;
    type.count += 1;
    byTypeMap.set(d.type, type);

    if (d.scheme) {
      const scheme = bySchemeMap.get(d.scheme.id) ?? {
        schemeId: d.scheme.id,
        schemeName: d.scheme.name,
        amount: 0,
      };
      scheme.amount += amount;
      bySchemeMap.set(d.scheme.id, scheme);
    }
  }

  return {
    total: round2(total),
    byDay: Array.from(byDayMap.entries())
      .map(([date, amount]) => ({ date, amount: round2(amount) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byStaff: Array.from(byStaffMap.values())
      .map((s) => ({ ...s, amount: round2(s.amount) }))
      .sort((a, b) => b.amount - a.amount),
    byItem: Array.from(byItemMap.values())
      .map((i) => ({ ...i, amount: round2(i.amount) }))
      .sort((a, b) => b.amount - a.amount),
    byType: Array.from(byTypeMap.values())
      .map((t) => ({ ...t, amount: round2(t.amount) }))
      .sort((a, b) => b.amount - a.amount),
    byScheme: Array.from(bySchemeMap.values())
      .map((s) => ({ ...s, amount: round2(s.amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}
