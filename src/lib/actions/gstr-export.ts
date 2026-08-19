"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { placeOfSupplyFromGstin } from "@/lib/gst-state-codes";
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
  const session = await requireRole(["owner", "pharmacist"]);
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
  const session = await requireRole(["owner", "pharmacist"]);
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

  const groups = new Map<string, Gstr1HsnRow>();
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
      existing.totalQuantity += line.qty;
      existing.totalValue += taxableValue + taxAmount;
      existing.taxableValue += taxableValue;
      existing.centralTaxAmount += cgstAmount;
      existing.stateTaxAmount += sgstAmount;
    } else {
      groups.set(key, {
        hsnCode,
        description: line.item.name,
        uqc: line.item.unit.toUpperCase(),
        totalQuantity: line.qty,
        totalValue: taxableValue + taxAmount,
        taxableValue,
        integratedTaxAmount: 0,
        centralTaxAmount: cgstAmount,
        stateTaxAmount: sgstAmount,
        cessAmount: 0,
      });
    }
  }

  return Array.from(groups.values())
    .map((r) => ({
      ...r,
      totalValue: round2(r.totalValue),
      taxableValue: round2(r.taxableValue),
      centralTaxAmount: round2(r.centralTaxAmount),
      stateTaxAmount: round2(r.stateTaxAmount),
    }))
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
  const session = await requireRole(["owner", "pharmacist"]);
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

  let taxableTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let nilRatedTotal = 0;

  for (const line of lines) {
    const taxRate = Number(line.taxRate);
    const taxableValue = line.qty * Number(line.rate) - Number(line.discountAmount);
    if (taxRate === 0) {
      nilRatedTotal += taxableValue;
      continue;
    }
    const taxAmount = (taxableValue * taxRate) / 100;
    taxableTotal += taxableValue;
    cgstTotal += taxAmount / 2;
    sgstTotal += taxAmount - taxAmount / 2;
  }

  return [
    {
      natureOfSupplies: "(a) Outward taxable supplies (other than zero rated, nil rated and exempted)",
      totalTaxableValue: round2(taxableTotal),
      integratedTax: 0,
      centralTax: round2(cgstTotal),
      stateTax: round2(sgstTotal),
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
