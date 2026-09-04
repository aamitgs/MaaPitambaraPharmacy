"use server";

import { prisma } from "@/lib/prisma";
import { localDateWindow } from "@/lib/date-range";
import { requirePermission } from "@/lib/rbac";
import { placeOfSupplyFromGstin } from "@/lib/gst-state-codes";
import { getBranchFilter } from "@/lib/branch-scope";
import { splitCgstSgst } from "@/lib/billing";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function dateWindow(from: string, to: string) {
  const { fromDate, toDate } = localDateWindow(from, to);
  return { fromDate, toDate };
}

/**
 * Column layouts below mirror the GST offline tool's b2cs.csv / hsn.csv and
 * the GSTR-3B form's Table 3.1, cross-checked against the GST portal's
 * Returns Offline Tool manual and multiple independent filing-software
 * references (Tally, ClearTax, GSTZen) for column names/order. Re-verify
 * against gst.gov.in before relying on this for an actual filing — the
 * portal's exact CSV spec can change between financial years.
 *
 * No GSTR-1 B2B section: this app has no field to capture a customer's
 * GSTIN (Customer is walk-in retail only), so every sale is, by
 * construction, a B2C supply. Add a Customer.gstin column and a B2B sheet
 * here if wholesale/B2B billing is ever added.
 */

export interface Gstr1B2csRow {
  type: "OE";
  placeOfSupply: string;
  taxRate: number;
  taxableValue: number;
  cessAmount: number;
}

export async function getGstr1B2cs(from: string, to: string): Promise<Gstr1B2csRow[]> {
  const session = await requirePermission("compliance.manage");
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

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
      invoice: { select: { branch: { select: { gstin: true } } } },
    },
  });

  const groups = new Map<string, Gstr1B2csRow>();
  for (const line of lines) {
    const placeOfSupply = placeOfSupplyFromGstin(line.invoice.branch.gstin) || "Unknown";
    const taxRate = Number(line.taxRate);
    const taxableValue = line.qty * Number(line.rate) - Number(line.discountAmount);
    const key = `${placeOfSupply}|${taxRate}`;

    const existing = groups.get(key);
    if (existing) {
      existing.taxableValue += taxableValue;
    } else {
      groups.set(key, { type: "OE", placeOfSupply, taxRate, taxableValue, cessAmount: 0 });
    }
  }

  return Array.from(groups.values())
    .map((r) => ({ ...r, taxableValue: round2(r.taxableValue) }))
    .sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.taxRate - b.taxRate);
}

export interface Gstr1HsnRow {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQuantity: number;
  totalValue: number;
  taxableValue: number;
  integratedTaxAmount: number;
  centralTaxAmount: number;
  stateTaxAmount: number;
  cessAmount: number;
}

export async function getGstr1HsnSummary(from: string, to: string): Promise<Gstr1HsnRow[]> {
  const session = await requirePermission("compliance.manage");
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

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
      item: { select: { hsnCode: true, name: true, unit: true } },
    },
  });

  // Accumulated as one unrounded taxAmount per group, not as two
  // independently-tracked CGST/SGST halves: `taxAmount / 2` and
  // `taxAmount - taxAmount / 2` are the same number, so tracking them
  // separately just carries the identical figure through twice and rounds
  // it the same way both times, instead of splitting the final total's odd
  // paisa the way `splitCgstSgst` does once, at output.
  const groups = new Map<
    string,
    Omit<Gstr1HsnRow, "centralTaxAmount" | "stateTaxAmount"> & { taxAmount: number }
  >();
  for (const line of lines) {
    const hsnCode = line.item.hsnCode || "—";
    const taxRate = Number(line.taxRate);
    const taxableValue = line.qty * Number(line.rate) - Number(line.discountAmount);
    const taxAmount = (taxableValue * taxRate) / 100;
    const key = `${hsnCode}|${taxRate}`;

    const existing = groups.get(key);
    if (existing) {
      existing.totalQuantity += line.qty;
      existing.totalValue += taxableValue + taxAmount;
      existing.taxableValue += taxableValue;
      existing.taxAmount += taxAmount;
    } else {
      groups.set(key, {
        hsnCode,
        description: line.item.name,
        uqc: line.item.unit.toUpperCase(),
        totalQuantity: line.qty,
        totalValue: taxableValue + taxAmount,
        taxableValue,
        integratedTaxAmount: 0,
        cessAmount: 0,
        taxAmount,
      });
    }
  }

  return Array.from(groups.values())
    .map(({ taxAmount, ...r }) => {
      const { cgst, sgst } = splitCgstSgst(round2(taxAmount));
      return {
        ...r,
        totalValue: round2(r.totalValue),
        taxableValue: round2(r.taxableValue),
        centralTaxAmount: cgst,
        stateTaxAmount: sgst,
      };
    })
    .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode));
}

export interface Gstr3bRow {
  natureOfSupplies: string;
  totalTaxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  cess: number;
}

/** Table 3.1 of GSTR-3B. Rows (b)/(d)/(e) are always zero — this app has no export, reverse-charge, or non-GST sale tracking. */
export async function getGstr3bSummary(from: string, to: string): Promise<Gstr3bRow[]> {
  const session = await requirePermission("compliance.manage");
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

  const lines = await prisma.salesInvoiceItem.findMany({
    where: {
      invoice: {
        tenantId: session.user.tenantId,
        ...branchFilter,
        status: "completed",
        invoiceDate: { gte: fromDate, lte: toDate },
      },
    },
    select: { qty: true, rate: true, taxRate: true, discountAmount: true },
  });

  // Credit notes in the same window net off outward supplies. Without this
  // 3.1(a) reports tax that a customer has already been refunded.
  const returnLines = await prisma.salesReturnItem.findMany({
    where: {
      salesReturn: {
        tenantId: session.user.tenantId,
        returnedAt: { gte: fromDate, lte: toDate },
      },
    },
    select: { taxRate: true, lineTotal: true },
  });

  let taxableTotal = 0;
  // One running tax total, split into CGST/SGST once at the end via
  // splitCgstSgst — accumulating `taxAmount / 2` and `taxAmount -
  // taxAmount / 2` as two separate running totals carries the same number
  // through twice (they're algebraically identical) and rounds it the same
  // way both times, instead of the two halves reconciling to the total.
  let taxTotal = 0;
  let nilRatedTotal = 0;

  for (const line of returnLines) {
    const taxRate = Number(line.taxRate);
    // Derived from the stored, discount-adjusted lineTotal — a return
    // line's `rate` is the original sale's pre-discount unit rate, so
    // `qty * rate` overstates a discounted sale's refunded tax/taxable.
    const lineTotal = Number(line.lineTotal);
    if (taxRate === 0) {
      nilRatedTotal -= lineTotal;
      continue;
    }
    const taxableValue = round2(lineTotal / (1 + taxRate / 100));
    taxableTotal -= taxableValue;
    taxTotal -= round2(lineTotal - taxableValue);
  }

  for (const line of lines) {
    const taxRate = Number(line.taxRate);
    const taxableValue = line.qty * Number(line.rate) - Number(line.discountAmount);
    if (taxRate === 0) {
      nilRatedTotal += taxableValue;
      continue;
    }
    const taxAmount = (taxableValue * taxRate) / 100;
    taxableTotal += taxableValue;
    taxTotal += taxAmount;
  }

  const { cgst, sgst } = splitCgstSgst(round2(taxTotal));

  return [
    {
      natureOfSupplies: "(a) Outward taxable supplies (other than zero rated, nil rated and exempted)",
      totalTaxableValue: round2(taxableTotal),
      integratedTax: 0,
      centralTax: cgst,
      stateTax: sgst,
      cess: 0,
    },
    {
      natureOfSupplies: "(b) Outward taxable supplies (zero rated)",
      totalTaxableValue: 0,
      integratedTax: 0,
      centralTax: 0,
      stateTax: 0,
      cess: 0,
    },
    {
      natureOfSupplies: "(c) Other outward supplies (Nil rated, exempted)",
      totalTaxableValue: round2(nilRatedTotal),
      integratedTax: 0,
      centralTax: 0,
      stateTax: 0,
      cess: 0,
    },
    {
      natureOfSupplies: "(d) Inward supplies (liable to reverse charge)",
      totalTaxableValue: 0,
      integratedTax: 0,
      centralTax: 0,
      stateTax: 0,
      cess: 0,
    },
    {
      natureOfSupplies: "(e) Non-GST outward supplies",
      totalTaxableValue: 0,
      integratedTax: 0,
      centralTax: 0,
      stateTax: 0,
      cess: 0,
    },
  ];
}

export type Gstr1CreditNoteRow = {
  noteNumber: string;
  noteDate: string;
  invoiceNumber: string;
  invoiceDate: string;
  noteType: string;
  placeOfSupply: string;
  rate: number;
  taxableValue: number;
  centralTax: number;
  stateTax: number;
};

/**
 * GSTR-1 Table 9B — credit notes against the B2C sales in Table 7. One row
 * per note per tax rate, which is how the offline tool expects them.
 *
 * Filing without these overstates output tax: the liability was declared
 * when the sale was made, and the note is what takes it back.
 */
export async function getGstr1CreditNotes(
  from: string,
  to: string
): Promise<Gstr1CreditNoteRow[]> {
  const session = await requirePermission("compliance.manage");
  const { fromDate, toDate } = dateWindow(from, to);

  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const returns = await prisma.salesReturn.findMany({
    where: {
      tenantId: session.user.tenantId,
      returnedAt: { gte: fromDate, lte: toDate },
      ...branchFilter,
    },
    orderBy: { returnedAt: "asc" },
    include: {
      branch: { select: { gstin: true } },
      invoice: { select: { invoiceNo: true, invoiceDate: true } },
      items: true,
    },
  });

  const rows: Gstr1CreditNoteRow[] = [];
  for (const note of returns) {
    // Same intra-state assumption the rest of the export makes: place of
    // supply is the branch's own state.
    const placeOfSupply = placeOfSupplyFromGstin(note.branch.gstin) || "Unknown";

    const byRate = new Map<number, { taxable: number; tax: number }>();
    for (const line of note.items) {
      const rate = Number(line.taxRate);
      // Derived from the stored, discount-adjusted lineTotal rather than
      // re-multiplying qty * rate — the latter ignores whatever discount
      // applied to the original sale line and overstates the note.
      const lineTotal = Number(line.lineTotal);
      const taxable = round2(lineTotal / (1 + rate / 100));
      const tax = round2(lineTotal - taxable);
      const bucket = byRate.get(rate) ?? { taxable: 0, tax: 0 };
      bucket.taxable += taxable;
      bucket.tax += tax;
      byRate.set(rate, bucket);
    }

    for (const [rate, bucket] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
      const { cgst, sgst } = splitCgstSgst(round2(bucket.tax));
      rows.push({
        noteNumber: note.returnNo,
        noteDate: note.returnedAt.toISOString().slice(0, 10),
        invoiceNumber: note.invoice.invoiceNo,
        invoiceDate: note.invoice.invoiceDate.toISOString().slice(0, 10),
        noteType: "C",
        placeOfSupply,
        rate,
        taxableValue: round2(bucket.taxable),
        centralTax: cgst,
        stateTax: sgst,
      });
    }
  }
  return rows;
}
