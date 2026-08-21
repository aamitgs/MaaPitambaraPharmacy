import "server-only";

/**
 * What a backup contains, and the order it must be restored in.
 *
 * The list is deliberately explicit rather than derived from
 * `Prisma.dmmf`: a table appearing in a backup is a decision (does losing
 * it cost the business anything?), and a generated list would quietly
 * start including — or excluding — tables as the schema moves. A new model
 * added to schema.prisma will NOT appear here until someone adds it, and
 * `assertBackupCoversSchema()` below is what makes that omission loud.
 *
 * Order matters on restore: a row cannot be inserted before the rows it
 * references. This array is that dependency order, parents first.
 */
export const BACKUP_TABLES = [
  // Tenant is restored separately — it is the root everything hangs off.
  "branches",
  "expenseCategories",
  "roles",
  "users",
  "taxSlabs",
  "taxSlabRates",
  "hsnTaxMappings",
  "items",
  "batches",
  "suppliers",
  "loyaltyTiers",
  // Tenant configuration, and restored with the rest: losing it would
  // silently change which medicines the app offers as substitutes for one
  // another, which is a clinical decision the pharmacy made deliberately.
  "saltAliases",
  // Restored with everything else, and it has to be: these counters say
  // which invoice and credit-note numbers have already been issued. Restore
  // without them and the next sale reuses a number that is already on a
  // customer's bill and in a filed return.
  "documentSequences",
  "customers",
  "doctors",
  "schemes",
  "coupons",
  "purchaseOrders",
  "purchaseOrderItems",
  "grns",
  "grnItems",
  "purchaseReturns",
  "purchaseReturnItems",
  "supplierLedgerEntries",
  "salesInvoices",
  "salesInvoiceItems",
  "discounts",
  "salesReturns",
  "salesReturnItems",
  "customerLedgerEntries",
  "stockTransfers",
  "stockTransferItems",
  "narcoticRegisterEntries",
  "cashUps",
  "promiseOrders",
  "expenses",
  "heldSales",
  "stockAdjustments",
  "stockAdjustmentItems",
  "stockCounts",
  "stockCountLines",
  "notes",
  "auditLogs",
  "backupLogs",
  "whatsappLogs",
  "smsLogs",
  "emailLogs",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/**
 * Models intentionally left out, with the reason. Anything not in
 * BACKUP_TABLES and not here is a bug, which is what the guard test
 * asserts.
 */
export const BACKUP_EXCLUSIONS: Record<string, string> = {
  Tenant: "restored separately as the root record",
  UserSession:
    "live sign-in state, not business data — restoring a backup must not " +
    "revive sessions that were ended, nor end ones that are currently in use",
  TrustedDevice:
    "a standing waiver of the second factor, tied to a cookie on one browser — " +
    "a restore is precisely the moment to re-assert MFA, so these are deliberately " +
    "not carried across and every device is asked for a code again",
  ErrorLog:
    "diagnostics, not business records — a restore should not resurrect last month's faults, " +
    "and stack traces name internal paths that need not travel with an exported backup",
};

export interface BackupPayload {
  version: number;
  exportedAt: string;
  tenantId: string;
  tenant: Record<string, unknown>;
  tables: Record<BackupTable, Record<string, unknown>[]>;
  counts: Record<string, number>;
}

/** Bumped when the payload shape changes in a way a restore must notice. */
export const BACKUP_VERSION = 2;
