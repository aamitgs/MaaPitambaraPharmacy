import "server-only";
import { prisma } from "@/lib/prisma";
import { BACKUP_TABLES, type BackupTable } from "@/lib/backup-schema";

/**
 * How each backup table is read for one tenant, and written back.
 *
 * Several models have no `tenantId` of their own — they hang off a parent
 * that does (a GrnItem belongs to a Grn, a Batch to an Item). Their `where`
 * walks that relation rather than assuming a column that isn't there, which
 * is precisely the mistake that would silently export zero rows.
 */
type TableSpec = {
  /** Prisma delegate name on the client. */
  model: string;
  /** Scope for one tenant's rows. */
  where: (tenantId: string) => Record<string, unknown>;
};

export const TABLE_SPECS: Record<BackupTable, TableSpec> = {
  branches: { model: "branch", where: (t) => ({ tenantId: t }) },
  expenseCategories: { model: "expenseCategory", where: (t) => ({ tenantId: t }) },
  roles: { model: "role", where: (t) => ({ tenantId: t }) },
  users: { model: "user", where: (t) => ({ tenantId: t }) },
  taxSlabs: { model: "taxSlab", where: (t) => ({ tenantId: t }) },
  taxSlabRates: { model: "taxSlabRate", where: (t) => ({ slab: { tenantId: t } }) },
  hsnTaxMappings: { model: "hsnTaxMapping", where: (t) => ({ tenantId: t }) },
  items: { model: "item", where: (t) => ({ tenantId: t }) },
  batches: { model: "batch", where: (t) => ({ item: { tenantId: t } }) },
  suppliers: { model: "supplier", where: (t) => ({ tenantId: t }) },
  customers: { model: "customer", where: (t) => ({ tenantId: t }) },
  doctors: { model: "doctor", where: (t) => ({ tenantId: t }) },
  loyaltyTiers: { model: "loyaltyTier", where: (t) => ({ tenantId: t }) },
  saltAliases: { model: "saltAlias", where: (t) => ({ tenantId: t }) },
  schemes: { model: "scheme", where: (t) => ({ tenantId: t }) },
  coupons: { model: "coupon", where: (t) => ({ tenantId: t }) },
  purchaseOrders: { model: "purchaseOrder", where: (t) => ({ tenantId: t }) },
  purchaseOrderItems: {
    model: "purchaseOrderItem",
    where: (t) => ({ purchaseOrder: { tenantId: t } }),
  },
  grns: { model: "grn", where: (t) => ({ tenantId: t }) },
  grnItems: { model: "grnItem", where: (t) => ({ grn: { tenantId: t } }) },
  purchaseReturns: { model: "purchaseReturn", where: (t) => ({ tenantId: t }) },
  purchaseReturnItems: {
    model: "purchaseReturnItem",
    where: (t) => ({ purchaseReturn: { tenantId: t } }),
  },
  supplierLedgerEntries: { model: "supplierLedgerEntry", where: (t) => ({ tenantId: t }) },
  salesInvoices: { model: "salesInvoice", where: (t) => ({ tenantId: t }) },
  salesInvoiceItems: {
    model: "salesInvoiceItem",
    where: (t) => ({ invoice: { tenantId: t } }),
  },
  discounts: { model: "discount", where: (t) => ({ tenantId: t }) },
  salesReturns: { model: "salesReturn", where: (t) => ({ tenantId: t }) },
  salesReturnItems: {
    model: "salesReturnItem",
    where: (t) => ({ salesReturn: { tenantId: t } }),
  },
  customerLedgerEntries: { model: "customerLedgerEntry", where: (t) => ({ tenantId: t }) },
  stockTransfers: { model: "stockTransfer", where: (t) => ({ tenantId: t }) },
  stockTransferItems: {
    model: "stockTransferItem",
    where: (t) => ({ transfer: { tenantId: t } }),
  },
  narcoticRegisterEntries: {
    model: "narcoticRegisterEntry",
    where: (t) => ({ tenantId: t }),
  },
  cashUps: { model: "cashUp", where: (t) => ({ tenantId: t }) },
  promiseOrders: { model: "promiseOrder", where: (t) => ({ tenantId: t }) },
  expenses: { model: "expense", where: (t) => ({ tenantId: t }) },
  heldSales: { model: "heldSale", where: (t) => ({ tenantId: t }) },
  stockAdjustments: { model: "stockAdjustment", where: (t) => ({ tenantId: t }) },
  stockAdjustmentItems: {
    model: "stockAdjustmentItem",
    where: (t) => ({ adjustment: { tenantId: t } }),
  },
  stockCounts: { model: "stockCount", where: (t) => ({ tenantId: t }) },
  stockCountLines: {
    model: "stockCountLine",
    where: (t) => ({ count: { tenantId: t } }),
  },
  notes: { model: "note", where: (t) => ({ tenantId: t }) },
  auditLogs: { model: "auditLog", where: (t) => ({ tenantId: t }) },
  backupLogs: { model: "backupLog", where: (t) => ({ tenantId: t }) },
  whatsappLogs: { model: "whatsAppLog", where: (t) => ({ tenantId: t }) },
  smsLogs: { model: "smsLog", where: (t) => ({ tenantId: t }) },
  emailLogs: { model: "emailLog", where: (t) => ({ tenantId: t }) },
};

const delegate = (model: string) => (prisma as any)[model];

export async function readTable(table: BackupTable, tenantId: string) {
  const spec = TABLE_SPECS[table];
  return (await delegate(spec.model).findMany({ where: spec.where(tenantId) })) as Record<
    string,
    unknown
  >[];
}

export async function countTable(table: BackupTable, tenantId: string): Promise<number> {
  const spec = TABLE_SPECS[table];
  return delegate(spec.model).count({ where: spec.where(tenantId) });
}

/**
 * Restore one table. `createMany` with `skipDuplicates` so a restore run
 * twice is harmless, and so a partially-restored database can be topped up
 * rather than needing to be wiped first.
 */
export async function writeTable(
  tx: unknown,
  table: BackupTable,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const spec = TABLE_SPECS[table];
  const result = await (tx as any)[spec.model].createMany({
    data: rows,
    skipDuplicates: true,
  });
  return result.count as number;
}

export async function clearTable(tx: unknown, table: BackupTable, tenantId: string) {
  const spec = TABLE_SPECS[table];
  await (tx as any)[spec.model].deleteMany({ where: spec.where(tenantId) });
}

export const RESTORE_ORDER = BACKUP_TABLES;
/** Children before parents, for the wipe that precedes a replace-restore. */
export const DELETE_ORDER = [...BACKUP_TABLES].reverse();
