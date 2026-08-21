"use server";

import { z } from "zod";
import { localDateWindow } from "@/lib/date-range";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { resolveConcreteBranch, getBranchFilter } from "@/lib/branch-scope";
import type { PaymentMode } from "@/generated/prisma/client";

/**
 * Running costs.
 *
 * Gated on `reports.view` rather than a new permission: knowing what the
 * shop spends is the same class of information as knowing what it earns,
 * and splitting them would mean an accountant who can read a P&L cannot
 * enter the rent that goes into it.
 */

/** Sensible starting set for an Indian pharmacy, created on first use. */
const DEFAULT_CATEGORIES: { name: string; isRecurring: boolean }[] = [
  { name: "Rent", isRecurring: true },
  { name: "Salaries & wages", isRecurring: true },
  { name: "Electricity", isRecurring: true },
  { name: "Phone & internet", isRecurring: true },
  { name: "Refrigeration & cold chain", isRecurring: true },
  { name: "Transport & delivery", isRecurring: false },
  { name: "Licence & renewal fees", isRecurring: false },
  { name: "Repairs & maintenance", isRecurring: false },
  { name: "Professional fees", isRecurring: false },
  { name: "Bank & payment charges", isRecurring: true },
  { name: "Packaging & stationery", isRecurring: false },
  { name: "Other", isRecurring: false },
];

export async function ensureExpenseCategories(tenantId: string) {
  const count = await prisma.expenseCategory.count({ where: { tenantId } });
  if (count > 0) return;
  await prisma.expenseCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({
      tenantId,
      name: c.name,
      isRecurring: c.isRecurring,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
}

export async function listExpenseCategories() {
  const session = await requirePermission("reports.view");
  await ensureExpenseCategories(session.user.tenantId);
  const rows = await prisma.expenseCategory.findMany({
    where: { tenantId: session.user.tenantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((c) => ({ id: c.id, name: c.name, isRecurring: c.isRecurring }));
}

const expenseSchema = z.object({
  categoryId: z.string().min(1, "Pick a category"),
  /** Local date, YYYY-MM-DD. */
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amount: z.coerce.number().positive("Enter an amount"),
  paymentMode: z.enum(["cash", "upi", "card", "credit"]).default("cash"),
  payee: z.string().trim().max(120).optional(),
  note: z.string().trim().max(300).optional(),
  documentUrl: z.string().trim().optional(),
});

export async function recordExpense(input: z.infer<typeof expenseSchema>) {
  const session = await requirePermission("reports.view");
  const tenantId = session.user.tenantId;
  const parsed = expenseSchema.parse(input);
  const branchId = await resolveConcreteBranch(tenantId, session.user.role);

  const category = await prisma.expenseCategory.findFirst({
    where: { id: parsed.categoryId, tenantId },
    select: { id: true, name: true },
  });
  if (!category) throw new Error("Category not found");

  // Parsed as local midnight so a cost dated the 1st belongs to the 1st in
  // the shop's timezone, not 05:30 into it.
  const [y, m, d] = parsed.incurredOn.split("-").map(Number);

  const expense = await prisma.expense.create({
    data: {
      tenantId,
      branchId,
      categoryId: category.id,
      incurredOn: new Date(y, m - 1, d),
      amount: parsed.amount,
      paymentMode: parsed.paymentMode as PaymentMode,
      payee: parsed.payee || null,
      note: parsed.note || null,
      documentUrl: parsed.documentUrl || null,
      recordedByUserId: session.user.id,
    },
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "expense.create",
    entity: "Expense",
    entityId: expense.id,
    after: {
      category: category.name,
      amount: parsed.amount,
      incurredOn: parsed.incurredOn,
      paymentMode: parsed.paymentMode,
    },
  });

  revalidatePath("/expenses");
  revalidatePath("/reports/profit-loss");
  return { id: expense.id };
}

export async function deleteExpense(id: string) {
  const session = await requirePermission("reports.view");
  const tenantId = session.user.tenantId;
  const expense = await prisma.expense.findFirst({
    where: { id, tenantId },
    include: { category: { select: { name: true } } },
  });
  if (!expense) throw new Error("Expense not found");

  await prisma.expense.delete({ where: { id } });
  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "expense.delete",
    entity: "Expense",
    entityId: id,
    before: {
      category: expense.category.name,
      amount: Number(expense.amount),
      incurredOn: expense.incurredOn.toISOString().slice(0, 10),
    },
  });
  revalidatePath("/expenses");
  revalidatePath("/reports/profit-loss");
}

export async function listExpenses(from: string, to: string) {
  const session = await requirePermission("reports.view");
  const tenantId = session.user.tenantId;
  const branchFilter = await getBranchFilter(tenantId, session.user.role);

  const { fromDate, toDate } = localDateWindow(from, to);

  const rows = await prisma.expense.findMany({
    where: { tenantId, ...branchFilter, incurredOn: { gte: fromDate, lte: toDate } },
    orderBy: { incurredOn: "desc" },
    include: {
      category: { select: { name: true, isRecurring: true } },
      recordedBy: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });

  return rows.map((e) => ({
    id: e.id,
    incurredOn: e.incurredOn.toISOString(),
    categoryName: e.category.name,
    isRecurring: e.category.isRecurring,
    amount: Number(e.amount),
    paymentMode: e.paymentMode,
    payee: e.payee,
    note: e.note,
    branchName: e.branch.name,
    recordedByName: e.recordedBy.name,
  }));
}
