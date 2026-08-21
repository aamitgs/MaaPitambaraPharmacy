"use server";

import { z } from "zod";
import { localDateWindow } from "@/lib/date-range";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer-identity";
import {
  serializeCustomer,
  serializeCustomerLedgerEntry,
  type PlainCustomer,
} from "@/lib/serialize";

/**
 * Customer.outstandingBalance is a cache column, never trusted. The real
 * balance is always the sum of this customer's ledger entries (credit
 * sales positive, payments negative) — mirrors computeOutstandingBalances
 * in suppliers.ts.
 */
export async function computeCustomerOutstandingBalances(tenantId: string, customerIds?: string[]) {
  const grouped = await prisma.customerLedgerEntry.groupBy({
    by: ["customerId"],
    where: { tenantId, ...(customerIds ? { customerId: { in: customerIds } } : {}) },
    _sum: { amount: true },
  });
  const balances = new Map<string, number>();
  for (const g of grouped) balances.set(g.customerId, Number(g._sum.amount ?? 0));
  return balances;
}

export async function listCustomers(): Promise<PlainCustomer[]> {
  const session = await requireSession();
  const customers = await prisma.customer.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });
  const balances = await computeCustomerOutstandingBalances(session.user.tenantId);
  return customers.map((c) => ({
    ...serializeCustomer(c),
    outstandingBalance: balances.get(c.id) ?? 0,
  }));
}

export async function getCustomer(id: string) {
  const session = await requireSession();
  const customer = await prisma.customer.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!customer) return null;

  const ledgerEntries = await prisma.customerLedgerEntry.findMany({
    where: { customerId: id, tenantId: session.user.tenantId },
    orderBy: { createdAt: "desc" },
  });
  const balances = await computeCustomerOutstandingBalances(session.user.tenantId, [id]);

  return {
    ...serializeCustomer(customer),
    outstandingBalance: balances.get(id) ?? 0,
    ledgerEntries: ledgerEntries.map(serializeCustomerLedgerEntry),
  };
}

const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  creditTermDays: z.coerce.number().int().min(0).max(365).optional(),
  /// Set once the counter has been shown who already uses this number and
  /// has said to add the record anyway — families really do share a phone.
  allowDuplicatePhone: z.boolean().optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export async function createCustomer(input: CustomerInput) {
  const session = await requireSession();
  const parsed = customerSchema.parse(input);

  // Catching a duplicate here is worth far more than merging one later:
  // once both records have bills against them, someone has to reconcile
  // two balances by hand. Blocked rather than warned, but overridable —
  // a mother and son on one phone are a real pair of customers.
  const phoneKey = normalizePhone(parsed.phone);
  if (phoneKey && !parsed.allowDuplicatePhone) {
    const existing = await prisma.customer.findMany({
      where: { tenantId: session.user.tenantId },
      select: { id: true, name: true, phone: true },
    });
    const clash = existing.find((c) => normalizePhone(c.phone) === phoneKey);
    if (clash) {
      throw new Error(`DUPLICATE_PHONE:${clash.name}`);
    }
  }

  const customer = await prisma.customer.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      phone: parsed.phone,
      creditLimit: parsed.creditLimit,
      creditTermDays: parsed.creditTermDays ?? null,
    },
  });
  revalidatePath("/customers");
  revalidatePath("/pos");
  return serializeCustomer(customer);
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(["cash", "upi", "card", "cheque", "bank_transfer"]),
  date: z.string().min(1),
  note: z.string().trim().optional(),
});

export type CustomerPaymentInput = z.infer<typeof paymentSchema>;

export async function recordCustomerPayment(customerId: string, input: CustomerPaymentInput) {
  const session = await requirePermission("customers.manage");
  const parsed = paymentSchema.parse(input);

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: session.user.tenantId },
  });
  if (!customer) throw new Error("Customer not found");

  // A date-only picker can't capture time-of-day, so a payment "dated
  // today" would otherwise be stored at midnight — sorting it before any
  // sale rung up earlier that same day in the statement/ledger. Use the
  // real current timestamp for today's date; only a genuinely backdated
  // date gets pinned to end-of-day, so it still sorts after that day's
  // other entries rather than before all of them.
  const today = new Date().toISOString().slice(0, 10);
  const entryDate = parsed.date === today ? new Date() : new Date(`${parsed.date}T23:59:59.999`);

  const noteParts = [`Method: ${parsed.method}`, parsed.note].filter(Boolean);
  const entry = await prisma.customerLedgerEntry.create({
    data: {
      tenantId: session.user.tenantId,
      customerId,
      type: "payment",
      amount: -Math.abs(parsed.amount),
      note: noteParts.join(" — "),
      createdAt: entryDate,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "customer.payment",
    entity: "CustomerLedgerEntry",
    entityId: entry.id,
    after: parsed,
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return serializeCustomerLedgerEntry(entry);
}

export interface CustomerStatementLine {
  date: string;
  type: "sale" | "payment" | "return" | "adjustment";
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  lines: CustomerStatementLine[];
}

/**
 * Opening balance = SUM of every ledger entry strictly before `from`.
 * Running balance then walks forward through entries in [from, to].
 */
export async function getCustomerStatement(customerId: string, from: string, to: string): Promise<CustomerStatement> {
  const session = await requirePermission("customers.manage");
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: session.user.tenantId },
  });
  if (!customer) throw new Error("Customer not found");

  const { fromDate, toDate } = localDateWindow(from, to);

  const [openingAgg, entries] = await Promise.all([
    prisma.customerLedgerEntry.aggregate({
      where: { tenantId: session.user.tenantId, customerId, createdAt: { lt: fromDate } },
      _sum: { amount: true },
    }),
    prisma.customerLedgerEntry.findMany({
      where: { tenantId: session.user.tenantId, customerId, createdAt: { gte: fromDate, lte: toDate } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const openingBalance = Number(openingAgg._sum.amount ?? 0);
  let running = openingBalance;
  const lines: CustomerStatementLine[] = entries.map((e) => {
    const amount = Number(e.amount);
    running += amount;
    return {
      date: e.createdAt.toISOString(),
      type: e.type,
      description: e.note || (e.type === "sale" ? `Invoice ${e.referenceId ?? ""}` : "Payment received"),
      debit: amount > 0 ? amount : 0,
      credit: amount < 0 ? -amount : 0,
      balance: running,
    };
  });

  return {
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    from,
    to,
    openingBalance,
    closingBalance: running,
    lines,
  };
}
