"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";
import type { StockLedgerType } from "@/lib/stock-ledger-labels";

function dateWindow(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  return { fromDate, toDate };
}

export interface SalesRegisterRow {
  id: string;
  invoiceNo: string;
  invoiceDate: Date;
  branchName: string;
  customerName: string;
  paymentMode: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

/** Owner/Pharmacist only — reconciles against underlying invoice totals, not something Counter Staff needs. */
export async function getSalesRegister(from: string, to: string): Promise<SalesRegisterRow[]> {
  const session = await requireRole(["owner", "pharmacist"]);
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...branchFilter,
      status: "completed",
      invoiceDate: { gte: fromDate, lte: toDate },
    },
    include: { branch: { select: { name: true } }, customer: { select: { name: true } } },
    orderBy: { invoiceDate: "desc" },
  });

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    invoiceDate: inv.invoiceDate,
    branchName: inv.branch.name,
    customerName: inv.customer?.name ?? "Walk-in",
    paymentMode: inv.paymentMode,
    subtotal: Number(inv.subtotal),
    discountAmount: Number(inv.discountAmount),
    taxAmount: Number(inv.taxAmount),
    total: Number(inv.total),
  }));
}

export interface PurchaseRegisterRow {
  id: string;
  receivedAt: Date;
  branchName: string;
  supplierName: string;
  supplierInvoiceNo: string;
  itemCount: number;
  total: number;
}

export async function getPurchaseRegister(from: string, to: string): Promise<PurchaseRegisterRow[]> {
  const session = await requireRole(["owner", "pharmacist"]);
  const branchFilter = await getBranchFilter(session.user.tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);

  const grns = await prisma.grn.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...branchFilter,
      receivedAt: { gte: fromDate, lte: toDate },
    },
    include: { branch: { select: { name: true } }, supplier: { select: { name: true } }, items: true },
    orderBy: { receivedAt: "desc" },
  });

  return grns.map((g) => ({
    id: g.id,
    receivedAt: g.receivedAt,
    branchName: g.branch.name,
    supplierName: g.supplier.name,
    supplierInvoiceNo: g.supplierInvoiceNo,
    itemCount: g.items.length,
    total: g.items.reduce((sum, i) => sum + i.qty * Number(i.rate), 0),
  }));
}

export interface StockLedgerRow {
  date: Date;
  branchName: string;
  itemName: string;
  batchNo: string;
  type: StockLedgerType;
  qtyChange: number;
  reference: string;
}

/**
 * Every stock movement across GRN receipts, sales, purchase returns, and
 * branch transfers, merged into one chronological log. Queried per source
 * (rather than one big join) since each has its own branch-scoping path —
 * a stock transfer touches two branches on two different sides of the same
 * row, which doesn't fit a single WHERE clause.
 */
export async function getStockLedger(from: string, to: string): Promise<StockLedgerRow[]> {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;
  const branchFilter = await getBranchFilter(tenantId, session.user.role);
  const { fromDate, toDate } = dateWindow(from, to);
  const dateFilter = { gte: fromDate, lte: toDate };

  const [grnItems, saleItems, returnItems, transfers] = await Promise.all([
    prisma.grnItem.findMany({
      where: { grn: { tenantId, ...branchFilter, receivedAt: dateFilter } },
      include: { item: { select: { name: true } }, batch: { select: { batchNo: true } }, grn: { include: { branch: { select: { name: true } } } } },
    }),
    prisma.salesInvoiceItem.findMany({
      where: { invoice: { tenantId, ...branchFilter, status: "completed", invoiceDate: dateFilter } },
      include: { item: { select: { name: true } }, batch: { select: { batchNo: true } }, invoice: { include: { branch: { select: { name: true } } } } },
    }),
    prisma.purchaseReturnItem.findMany({
      where: { purchaseReturn: { tenantId, ...branchFilter, returnDate: dateFilter } },
      include: { item: { select: { name: true } }, batch: { select: { batchNo: true } }, purchaseReturn: { include: { branch: { select: { name: true } } } } },
    }),
    prisma.stockTransfer.findMany({
      where: {
        tenantId,
        status: "completed",
        completedAt: dateFilter,
        ...(branchFilter.branchId ? { OR: [{ fromBranchId: branchFilter.branchId }, { toBranchId: branchFilter.branchId }] } : {}),
      },
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        items: { include: { item: { select: { name: true } }, batch: { select: { batchNo: true } } } },
      },
    }),
  ]);

  const rows: StockLedgerRow[] = [];

  for (const gi of grnItems) {
    rows.push({
      date: gi.grn.receivedAt,
      branchName: gi.grn.branch.name,
      itemName: gi.item.name,
      batchNo: gi.batch.batchNo,
      type: "grn",
      qtyChange: gi.qty,
      reference: `GRN · ${gi.grn.supplierInvoiceNo}`,
    });
  }

  for (const si of saleItems) {
    rows.push({
      date: si.invoice.invoiceDate,
      branchName: si.invoice.branch.name,
      itemName: si.item.name,
      batchNo: si.batch.batchNo,
      type: "sale",
      qtyChange: -si.qty,
      reference: `Invoice ${si.invoice.invoiceNo}`,
    });
  }

  for (const ri of returnItems) {
    rows.push({
      date: ri.purchaseReturn.returnDate,
      branchName: ri.purchaseReturn.branch.name,
      itemName: ri.item.name,
      batchNo: ri.batch.batchNo,
      type: "purchase_return",
      qtyChange: -ri.qty,
      reference: `Return`,
    });
  }

  for (const t of transfers) {
    const includeFrom = !branchFilter.branchId || t.fromBranchId === branchFilter.branchId;
    const includeTo = !branchFilter.branchId || t.toBranchId === branchFilter.branchId;
    for (const ti of t.items) {
      if (includeFrom) {
        rows.push({
          date: t.completedAt!,
          branchName: t.fromBranch.name,
          itemName: ti.item.name,
          batchNo: ti.batch.batchNo,
          type: "transfer_out",
          qtyChange: -ti.qty,
          reference: `To ${t.toBranch.name}`,
        });
      }
      if (includeTo) {
        rows.push({
          date: t.completedAt!,
          branchName: t.toBranch.name,
          itemName: ti.item.name,
          batchNo: ti.batch.batchNo,
          type: "transfer_in",
          qtyChange: ti.qty,
          reference: `From ${t.fromBranch.name}`,
        });
      }
    }
  }

  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  return rows;
}
