import "server-only";
import { buildReceiptData } from "@/lib/receipt-data";

/**
 * The customer-facing bill lookup. No session — the token is the
 * credential — and scoped to exactly one invoice by that token.
 *
 * Not a `"use server"` module: nothing here should be callable from a
 * browser as an action, only rendered by the public page.
 */
export async function getInvoiceForPublicBill(token: string) {
  // A token that is not 32 hex characters cannot be one this app issued,
  // so it is rejected before touching the database.
  if (!/^[0-9a-f]{32}$/.test(token)) return null;

  const data = await buildReceiptData({ publicToken: token, status: "completed" });
  return data;
}
