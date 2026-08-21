import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * The read-only bill link handed to a customer.
 *
 * 32 hex characters — 128 bits — because this URL is the only thing
 * standing between a stranger and someone's medical purchase history. It
 * goes out over SMS, which is not a confidential channel, so the token has
 * to be long enough that guessing is hopeless even though the link itself
 * may sit in a phone's message log for years.
 *
 * Generated lazily: a bill nobody shares never gets a token, so the
 * publicly reachable surface stays as small as what was actually shared.
 */
export async function ensurePublicToken(invoiceId: string, tenantId: string): Promise<string> {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { publicToken: true },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.publicToken) return invoice.publicToken;

  const token = randomBytes(16).toString("hex");
  await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { publicToken: token } });
  return token;
}

/**
 * Absolute URL for the link. Read from the environment rather than a
 * request header: a link that ends up in a customer's phone must point at
 * the pharmacy's real address, not at whatever Host the sending request
 * happened to carry.
 */
export function publicBillUrl(token: string): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return `${base}/bill/${token}`;
}

export function isPublicBillConfigured(): boolean {
  return Boolean(process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL);
}
