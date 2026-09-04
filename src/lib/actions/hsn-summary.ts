"use server";

import { prisma } from "@/lib/prisma";
import { localDateWindow } from "@/lib/date-range";
import { requirePermission } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import { splitCgstSgst } from "@/lib/billing";

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
  const session = await requirePermission("reports.view");
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);

  const { fromDate, toDate } = localDateWindow(from, to);

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

  // Grouped on a single running taxAmount, not two independently-tracked
  // CGST/SGST halves: `taxAmount / 2` and `taxAmount - taxAmount / 2` are
  // the same number, so carrying them separately just rounds the identical
  // figure the same way twice instead of splitting the group's odd paisa
  // between them the way `splitCgstSgst` does once, at output.
  const groups = new Map<string, Omit<HsnSummaryRow, "cgstAmount" | "sgstAmount">>();
  for (const line of lines) {
    const hsnCode = line.item.hsnCode || "—";
    const taxRate = Number(line.taxRate);
    const taxableValue = line.qty * Number(line.rate) - Number(line.discountAmount);
    const taxAmount = (taxableValue * taxRate) / 100;
    const key = `${hsnCode}|${taxRate}`;

    const existing = groups.get(key);
    if (existing) {
      existing.taxableValue += taxableValue;
      existing.taxAmount += taxAmount;
      existing.totalValue += taxableValue + taxAmount;
    } else {
      groups.set(key, {
        hsnCode,
        taxRate,
        taxableValue,
        taxAmount,
        totalValue: taxableValue + taxAmount,
      });
    }
  }

  return Array.from(groups.values())
    .map((r) => {
      const taxAmount = round2(r.taxAmount);
      const { cgst, sgst } = splitCgstSgst(taxAmount);
      return {
        ...r,
        taxableValue: round2(r.taxableValue),
        cgstAmount: cgst,
        sgstAmount: sgst,
        taxAmount,
        totalValue: round2(r.totalValue),
      };
    })
    .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode) || a.taxRate - b.taxRate);
}
