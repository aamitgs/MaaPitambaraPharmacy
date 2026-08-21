import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Records an exception somewhere a human will find it.
 *
 * The console is not that place. On a counter PC running the app in a
 * browser, a server-side stack trace goes to a terminal nobody has open,
 * and the first anyone hears of a fault is a customer saying the bill
 * printed wrong last Tuesday.
 *
 * Repeats are folded into one row with a count. A failing integration can
 * throw on every single sale, and ten thousand identical rows would bury
 * the one unusual error that actually needed reading.
 */
export type ErrorSource = "server-action" | "route" | "client";

/// Two errors count as "the same" when they came from the same place with
/// the same message. The stack is kept from the first occurrence — later
/// ones are almost always identical, and the first is the one closest to
/// whatever changed.
export async function recordError(params: {
  source: ErrorSource;
  context: string;
  error: unknown;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<void> {
  const { source, context, error, tenantId = null, userId = null } = params;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;

  try {
    const existing = await prisma.errorLog.findFirst({
      where: { tenantId, source, context, message, resolvedAt: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.errorLog.update({
        where: { id: existing.id },
        data: { occurrences: { increment: 1 }, lastSeenAt: new Date(), userId },
      });
      return;
    }

    await prisma.errorLog.create({
      data: { tenantId, userId, source, context, message: message.slice(0, 2000), stack },
    });
  } catch {
    // Logging must never be the thing that breaks a sale. If the database
    // is the reason we are here, writing a row about it cannot work
    // either — fall back to the console and let the caller carry on.
    console.error(`[${source}] ${context}:`, error);
  }
}
