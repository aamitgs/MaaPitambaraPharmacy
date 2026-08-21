import type { UserRole } from "@/generated/prisma/client";

/**
 * The permission catalogue. Keys are stable strings stored on Role rows, so
 * renaming one silently revokes access — add a new key and migrate instead.
 *
 * Grouped by the feature area each server-action file covers, which is how
 * the gates were already organised: every action in grn.ts is purchasing,
 * every action in items.ts is the item master, and so on.
 */
export const PERMISSIONS = {
  "sales.sell": "Ring up sales",
  "sales.cancel": "Cancel or refund an invoice",
  // PTR is below retail by design, so billing at it hands margin away.
  // Not granted to counter staff by default: whoever can do this can sell
  // at cost-plus-a-little to anyone who asks.
  "sales.wholesale": "Bill at wholesale (PTR) rates",
  "items.manage": "Add and edit items and batches",
  "purchasing.manage": "Purchase orders, GRN, returns, suppliers, transfers",
  "purchasing.viewRates": "See purchase rates and margins",
  "customers.manage": "Add and edit customers and doctors",
  "promotions.manage": "Schemes, loyalty tiers and coupons",
  "cashup.manage": "Count the till and close a shift",
  // Deliberately not granted to counter staff by default: writing stock
  // off is how a shortage gets hidden, so it wants a second pair of eyes.
  "stock.adjust": "Write stock off, or correct it after a count",
  "reports.view": "Sales, purchase, stock and margin reports",
  "compliance.manage": "Narcotic register, licences and GST exports",
  "branches.manage": "Branch details and settings",
  "data.import": "Import and export data files",
  "backup.manage": "Run and download backups",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/**
 * Staff administration is deliberately NOT a permission. Adding, editing and
 * removing users and roles is owner-only and hard-gated in the actions — an
 * owner who could grant it away could be locked out of their own pharmacy by
 * someone they promoted.
 */

/**
 * What the three shipped roles could do before roles became editable. The
 * seeded system roles are created from this, so behaviour is unchanged until
 * somebody deliberately changes a role.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [...PERMISSION_KEYS],
  pharmacist: [
    "sales.sell",
    "sales.cancel",
    "sales.wholesale",
    "items.manage",
    "purchasing.manage",
    "purchasing.viewRates",
    "customers.manage",
    "promotions.manage",
    "cashup.manage",
    "stock.adjust",
    "reports.view",
    "compliance.manage",
    "branches.manage",
    "data.import",
    "backup.manage",
  ],
  counter_staff: ["sales.sell", "customers.manage", "cashup.manage", "backup.manage"],
};

export const SYSTEM_ROLE_NAMES: Record<UserRole, string> = {
  owner: "Owner",
  pharmacist: "Pharmacist",
  counter_staff: "Counter Staff",
};
