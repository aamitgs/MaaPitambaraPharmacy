"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { auth } from "@/auth";
import { writeAuditLog } from "@/lib/audit";

export type SessionRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAgent: string | null;
  ipPrefix: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  isCurrent: boolean;
};

/**
 * Signed-in devices.
 *
 * Everyone sees their own. An owner also sees everyone else's, because
 * "who is signed in as the counter account right now" is a question only
 * the owner can act on — and on a shared shop PC it is the question that
 * matters.
 */
export async function listSessions(scope: "mine" | "all" = "mine"): Promise<SessionRow[]> {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";
  const currentSid = (await auth())?.sid;

  const rows = await prisma.userSession.findMany({
    where: {
      tenantId: session.user.tenantId,
      revokedAt: null,
      ...(scope === "all" && isOwner ? {} : { userId: session.user.id }),
    },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      userId: true,
      userAgent: true,
      ipPrefix: true,
      createdAt: true,
      lastSeenAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    userEmail: r.user.email,
    userAgent: r.userAgent,
    ipPrefix: r.ipPrefix,
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    isCurrent: r.id === currentSid,
  }));
}

/**
 * Ends a session. Takes effect on that device's next request rather than
 * whenever its token would have expired.
 */
export async function revokeSession(id: string) {
  const session = await requireSession();
  const isOwner = session.user.role === "owner";

  const target = await prisma.userSession.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, userId: true, user: { select: { name: true } } },
  });
  if (!target) throw new Error("That session has already ended.");

  // Your own, always. Someone else's, only if you are the owner —
  // otherwise any member of staff could sign the owner out.
  if (target.userId !== session.user.id && !isOwner) {
    throw new Error("You can only end your own sessions.");
  }

  await prisma.userSession.update({
    where: { id },
    data: { revokedAt: new Date(), revokedByUserId: session.user.id },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "session.revoke",
    entity: "UserSession",
    entityId: id,
    after: { endedFor: target.user.name, ownSession: target.userId === session.user.id },
  });

  revalidatePath("/security");
}

/** Ends every session for this account except the one asking. */
export async function revokeOtherSessions() {
  const session = await requireSession();
  const currentSid = (await auth())?.sid;

  const { count } = await prisma.userSession.updateMany({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      revokedAt: null,
      ...(currentSid ? { id: { not: currentSid } } : {}),
    },
    data: { revokedAt: new Date(), revokedByUserId: session.user.id },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "session.revoke_others",
    entity: "User",
    entityId: session.user.id,
    after: { ended: count },
  });

  revalidatePath("/security");
  return count;
}
