"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { parseLocalDate } from "@/lib/date-range";

/**
 * Reading the audit trail.
 *
 * Every privileged action in this app has written a row here since it was
 * built, and until now nothing read them — a log nobody can open answers no
 * questions. Owner-only, and read-only by construction: there is no update
 * or delete path anywhere in the codebase, which is what makes the trail
 * worth anything.
 */

const PAGE_SIZE = 50;

export type AuditLogRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  before: unknown;
  after: unknown;
};

const filterSchema = z.object({
  action: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  entity: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  cursor: z.string().trim().optional(),
});

export type AuditLogFilter = z.infer<typeof filterSchema>;

export async function listAuditLog(filter: AuditLogFilter = {}) {
  const session = await requireRole(["owner"]);
  const parsed = filterSchema.parse(filter);

  const where: Prisma.AuditLogWhereInput = { tenantId: session.user.tenantId };
  if (parsed.action) where.action = parsed.action;
  if (parsed.userId) where.userId = parsed.userId;
  if (parsed.entity) where.entity = parsed.entity;
  if (parsed.from || parsed.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (parsed.from) createdAt.gte = parseLocalDate(parsed.from);
    if (parsed.to) {
      const to = parseLocalDate(parsed.to);
      to.setHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
    where.createdAt = createdAt;
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    // One extra row tells us whether another page exists without a second
    // COUNT over a table that only ever grows.
    take: PAGE_SIZE + 1,
    ...(parsed.cursor ? { cursor: { id: parsed.cursor }, skip: 1 } : {}),
    include: { user: { select: { name: true, email: true } } },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return {
    rows: page.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      createdAt: r.createdAt.toISOString(),
      userName: r.user.name,
      userEmail: r.user.email,
      before: r.before,
      after: r.after,
    })) satisfies AuditLogRow[],
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** Everything that has actually been recorded, for the filter dropdowns. */
export async function getAuditLogFacets() {
  const session = await requireRole(["owner"]);
  const tenantId = session.user.tenantId;

  const [actions, entities, users] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { tenantId },
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    actions: actions.map((a) => a.action),
    entities: entities.map((e) => e.entity),
    users,
  };
}
