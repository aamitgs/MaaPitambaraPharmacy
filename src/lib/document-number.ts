import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Allocation of the numbers that go on documents customers and auditors see:
 * invoices (INV), credit notes (CN), stock adjustments (ADJ) and stock counts
 * (CNT).
 *
 * Previously each caller derived its own number by looking at what had
 * already been issued — COUNT + 1 in two places, MAX + 1 in three others —
 * and that read is not safe against a concurrent writer. Two tills billing at
 * the same moment both see the same highest number and both build the same
 * next one; the unique index on the document then rejects whichever commits
 * second, so a sale fails at the counter with a constraint error. The window
 * is small in ordinary use and wide open in the one case that matters most:
 * syncing a queue of sales after the internet returns, where many documents
 * are created back to back.
 */

export type DocumentPrefix = "INV" | "CN" | "ADJ" | "CNT";

/**
 * YYYYMM in the pharmacy's own timezone. Local getters, not toISOString():
 * a sale at 02:00 IST on the 1st belongs to the month that just started, and
 * UTC would file it under the one that just ended. instrumentation.ts pins
 * the process to IST so this is true on a cloud host too.
 */
export function periodKeyFor(now: Date = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Zero-padded to four digits, and simply longer past 9999 rather than wrapping. */
export function formatDocumentNumber(
  prefix: DocumentPrefix,
  periodKey: string,
  n: number
): string {
  return `${prefix}-${periodKey}-${String(n).padStart(4, "0")}`;
}

/**
 * Reserves the next number for `prefix` in the current month and returns it
 * formatted.
 *
 * Must be called with the transaction that writes the document. The row is
 * locked by the UPDATE until that transaction ends, which is what serialises
 * two tills; and because the counter is an ordinary row rather than a
 * Postgres sequence, a transaction that rolls back returns its number instead
 * of burning it. That keeps the series gapless, which matters because a
 * missing invoice number is a question to answer at filing time.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  prefix: DocumentPrefix,
  now: Date = new Date()
): Promise<string> {
  const periodKey = periodKeyFor(now);

  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "document_sequences" ("id", "tenantId", "prefix", "periodKey", "lastNumber", "updatedAt")
    VALUES (gen_random_uuid()::text, ${tenantId}, ${prefix}, ${periodKey}, 1, NOW())
    ON CONFLICT ("tenantId", "prefix", "periodKey")
    DO UPDATE SET "lastNumber" = "document_sequences"."lastNumber" + 1, "updatedAt" = NOW()
    RETURNING "lastNumber"
  `;

  return formatDocumentNumber(prefix, periodKey, rows[0].lastNumber);
}
