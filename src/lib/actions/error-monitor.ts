"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordError, type ErrorSource } from "@/lib/error-log";
import { auth } from "@/auth";

export type ErrorRow = {
  id: string;
  source: string;
  context: string;
  message: string;
  stack: string | null;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export async function listErrors(includeResolved = false): Promise<ErrorRow[]> {
  const session = await requireRole(["owner"]);
  return prisma.errorLog.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(includeResolved ? {} : { resolvedAt: null }),
    },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    select: {
      id: true, source: true, context: true, message: true, stack: true,
      occurrences: true, firstSeenAt: true, lastSeenAt: true,
    },
  });
}

export async function resolveError(id: string) {
  const session = await requireRole(["owner"]);
  await prisma.errorLog.updateMany({
    where: { id, tenantId: session.user.tenantId },
    data: { resolvedAt: new Date() },
  });
  revalidatePath("/security");
}

/**
 * Lets the browser report an error the server never saw — a render crash,
 * a failed fetch, a print that threw. Without this half the faults on a
 * counter PC are invisible.
 */
export async function reportClientError(context: string, message: string, stack?: string) {
  const session = await auth();
  await recordError({
    source: "client" satisfies ErrorSource,
    context: context.slice(0, 200),
    error: Object.assign(new Error(message.slice(0, 2000)), { stack }),
    tenantId: session?.user?.tenantId ?? null,
    userId: session?.user?.id ?? null,
  });
}
