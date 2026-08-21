"use server";

import { prisma } from "@/lib/prisma";
import { localDateWindow } from "@/lib/date-range";
import { requirePermission } from "@/lib/rbac";
import { getBranchFilter } from "@/lib/branch-scope";

/**
 * Profit and loss for a period.
 *
 * Three deliberate choices, each of which changes the number materially:
 *
 *   Revenue is **net of GST**. The tax collected on a sale was never the
 *   pharmacy's money — including it would overstate turnover by the GST
 *   rate and make every margin look better than it is.
 *
 *   Cost of goods sold is the **purchase rate of the specific batch that
 *   was sold**, not an average or the current rate. That is what the stock
 *   actually cost, and it is why the margin report and this agree.
 *
 *   Stock purchased in the period is **not** a cost here. Buying inventory
 *   moves money from cash to stock; it becomes a cost when it is sold.
 *   Treating purchases as expenses is the most common way a shop convinces
 *   itself it is losing money in a month it stocked up.
 */
export type ProfitAndLoss = {
  from: string;
  to: string;
  revenue: number;
  returnsValue: number;
  netRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
  expensesByCategory: { name: string; amount: number; isRecurring: boolean }[];
  totalExpenses: number;
  netProfit: number;
  netMarginPercent: number;
  /** Stock written off in the period — a real loss, shown apart from expenses. */
  stockWriteOffs: number;
  /** Purchases, shown for context only; deliberately not subtracted. */
  stockPurchased: number;
  invoiceCount: number;
};

export async function getProfitAndLoss(from: string, to: string): Promise<ProfitAndLoss> {
  const session = await requirePermission("reports.view");
  const tenantId = session.user.tenantId;
  const branchFilter = await getBranchFilter(tenantId, session.user.role);

  const { fromDate, toDate } = localDateWindow(from, to);
  const window = { gte: fromDate, lte: toDate };

  const [saleLines, returnLines, expenses, writeOffs, purchases, invoiceCount] =
    await Promise.all([
      prisma.salesInvoiceItem.findMany({
        where: {
          invoice: { tenantId, ...branchFilter, status: "completed", invoiceDate: window },
        },
        select: {
          qty: true,
          rate: true,
          discountAmount: true,
          batch: { select: { purchaseRate: true } },
        },
      }),
      prisma.salesReturnItem.findMany({
        where: { salesReturn: { tenantId, ...branchFilter, returnedAt: window } },
        select: {
          qty: true,
          rate: true,
          restock: true,
          batch: { select: { purchaseRate: true } },
        },
      }),
      prisma.expense.groupBy({
        by: ["categoryId"],
        where: { tenantId, ...branchFilter, incurredOn: window },
        _sum: { amount: true },
      }),
      prisma.stockAdjustmentItem.findMany({
        where: {
          adjustment: { tenantId, ...branchFilter, adjustedAt: window },
          qtyChange: { lt: 0 },
        },
        select: { qtyChange: true, unitCost: true },
      }),
      prisma.supplierLedgerEntry.aggregate({
        where: { tenantId, type: "purchase", createdAt: window },
        _sum: { amount: true },
      }),
      prisma.salesInvoice.count({
        where: { tenantId, ...branchFilter, status: "completed", invoiceDate: window },
      }),
    ]);

  // Taxable value, i.e. after item discount and before GST.
  const revenue = saleLines.reduce(
    (sum, l) => sum + (l.qty * Number(l.rate) - Number(l.discountAmount)),
    0
  );
  const costOfGoodsSold = saleLines.reduce(
    (sum, l) => sum + l.qty * Number(l.batch?.purchaseRate ?? 0),
    0
  );

  const returnsValue = returnLines.reduce((sum, l) => sum + l.qty * Number(l.rate), 0);
  // Only restocked returns give the cost back. A returned strip that was
  // binned stays a cost — the pharmacy paid for it and cannot sell it.
  const returnedCost = returnLines.reduce(
    (sum, l) => sum + (l.restock ? l.qty * Number(l.batch?.purchaseRate ?? 0) : 0),
    0
  );

  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: expenses.map((e) => e.categoryId) } },
    select: { id: true, name: true, isRecurring: true },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const expensesByCategory = expenses
    .map((e) => ({
      name: categoryById.get(e.categoryId)?.name ?? "Uncategorised",
      isRecurring: categoryById.get(e.categoryId)?.isRecurring ?? false,
      amount: Number(e._sum.amount ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalExpenses = expensesByCategory.reduce((s, e) => s + e.amount, 0);
  const stockWriteOffs = writeOffs.reduce(
    (sum, w) => sum + Math.abs(w.qtyChange) * Number(w.unitCost),
    0
  );

  const netRevenue = revenue - returnsValue;
  const netCogs = costOfGoodsSold - returnedCost;
  const grossProfit = netRevenue - netCogs;
  const netProfit = grossProfit - totalExpenses - stockWriteOffs;

  const round = (n: number) => Math.round(n * 100) / 100;
  const pct = (part: number, whole: number) =>
    whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

  return {
    from,
    to,
    revenue: round(revenue),
    returnsValue: round(returnsValue),
    netRevenue: round(netRevenue),
    costOfGoodsSold: round(netCogs),
    grossProfit: round(grossProfit),
    grossMarginPercent: pct(grossProfit, netRevenue),
    expensesByCategory: expensesByCategory.map((e) => ({ ...e, amount: round(e.amount) })),
    totalExpenses: round(totalExpenses),
    stockWriteOffs: round(stockWriteOffs),
    stockPurchased: round(Number(purchases._sum.amount ?? 0)),
    netProfit: round(netProfit),
    netMarginPercent: pct(netProfit, netRevenue),
    invoiceCount,
  };
}
