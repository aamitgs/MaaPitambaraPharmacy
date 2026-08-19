"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";

export interface HsnSummaryRow {
  hsnCode: string;
  taxRate: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  totalValue: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * HSN-wise summary of completed sales for a period, aggregated by
 * (HSN code, tax rate) — the same grouping GSTR-1's HSN summary table
 * expects. CGST/SGST re-derived per line using the same intra-state
 * 50/50 split as billing.ts and the receipt.
 */
export async function getHsnSummary(from: string, to: string): Promise<HsnSummaryRow[]> {
  const session = await requireRole(["owner", "pharmacist"]);
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const lines = await prisma.salesInvoiceItem.findMany({
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
      taxRate: true,
      discountAmount: true,
      item: { select: { hsnCode: true } },
    },
  });

  const groups = new Map<string, HsnSummaryRow>();
  for (const line of lines) {
    const hsnCode = line.item.hsnCode || "—";
    const taxRate = Number(line.taxRate);
    const taxableValue = line.qty * Number(line.rate) - Number(line.discountAmount);
    const taxAmount = (taxableValue * taxRate) / 100;
    const cgstAmount = taxAmount / 2;
    const sgstAmount = taxAmount - cgstAmount;
    const key = `${hsnCode}|${taxRate}`;

    const existing = groups.get(key);
    if (existing) {
      existing.taxableValue += taxableValue;
      existing.cgstAmount += cgstAmount;
      existing.sgstAmount += sgstAmount;
      existing.taxAmount += taxAmount;
      existing.totalValue += taxableValue + taxAmount;
    } else {
      groups.set(key, {
        hsnCode,
        taxRate,
        taxableValue,
        cgstAmount,
        sgstAmount,
        taxAmount,
        totalValue: taxableValue + taxAmount,
      });
    }
  }

  return Array.from(groups.values())
    .map((r) => ({
      ...r,
      taxableValue: round2(r.taxableValue),
      cgstAmount: round2(r.cgstAmount),
      sgstAmount: round2(r.sgstAmount),
      taxAmount: round2(r.taxAmount),
      totalValue: round2(r.totalValue),
    }))
    .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.taxRate - b.taxRate);
}
