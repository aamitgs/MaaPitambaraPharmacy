"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { describeDevice } from "@/lib/user-agent";
import { truncateIp } from "@/lib/session-registry";
import {
  newDeviceToken, hashDeviceToken, trustExpiry, daysRemaining,
  TRUST_COOKIE, TRUST_DAYS,
} from "@/lib/trusted-device";

/**
 * "Don't ask for a code on this device for the next 15 days."
 *
 * Called straight after a successful sign-in, so it runs as the user who
 * just proved both factors — which is the point: a device can only be
 * trusted by someone who has already passed the OTP once on it.
 */
export async function rememberThisDevice() {
  const session = await requireSession();
  const h = await headers();

  const token = newDeviceToken();
  const expiresAt = trustExpiry();

  const device = await prisma.trustedDevice.create({
    data: {
      userId: session.user.id,
      tokenHash: hashDeviceToken(token),
      label: describeDevice(h.get("user-agent")),
      ip: truncateIp(h.get("x-forwarded-for") ?? h.get("x-real-ip")),
      expiresAt,
    },
  });

  const jar = await cookies();
  jar.set(TRUST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  // Worth a record: it is a deliberate weakening of this account's login,
  // and the owner should be able to see when it was chosen.
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "trusted_device.create",
    entity: "TrustedDevice",
    entityId: device.id,
    after: { days: TRUST_DAYS, expiresAt: expiresAt.toISOString() },
  });

  revalidatePath("/security");
  return { ok: true as const, days: TRUST_DAYS };
}

export type TrustedDeviceRow = {
  id: string;
  label: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  daysLeft: number;
  isThisDevice: boolean;
};

/** The devices currently skipping the code for the signed-in user. */
export async function listTrustedDevices(): Promise<TrustedDeviceRow[]> {
  const session = await requireSession();
  const jar = await cookies();
  const token = jar.get(TRUST_COOKIE)?.value;
  const thisHash = token ? hashDeviceToken(token) : null;

  const rows = await prisma.trustedDevice.findMany({
    where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
  });

  return rows.map((d) => ({
    id: d.id,
    label: d.label ?? "Unknown device",
    ip: d.ip,
    createdAt: d.createdAt.toISOString(),
    lastUsedAt: d.lastUsedAt.toISOString(),
    daysLeft: daysRemaining(d.expiresAt),
    isThisDevice: thisHash !== null && d.tokenHash === thisHash,
  }));
}

/** Stop skipping the code on one device. Takes effect on its next sign-in. */
export async function revokeTrustedDevice(id: string) {
  const session = await requireSession();

  // Scoped to the signed-in user: nobody revokes somebody else's device by
  // guessing an id.
  const { count } = await prisma.trustedDevice.updateMany({
    where: { id, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw new Error("That device is no longer trusted.");

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "trusted_device.revoke",
    entity: "TrustedDevice",
    entityId: id,
  });

  revalidatePath("/security");
}

/**
 * Drop every trust on this account.
 *
 * Called on its own from the security screen, and automatically whenever the
 * password changes or MFA is reset — at that point the old decision was made
 * by someone who may no longer be the account's owner.
 */
export async function revokeAllTrustedDevices(userId?: string) {
  const session = await requireSession();
  const target = userId ?? session.user.id;
  if (target !== session.user.id) throw new Error("You can only clear your own devices.");

  const { count } = await prisma.trustedDevice.updateMany({
    where: { userId: target, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const jar = await cookies();
  jar.delete(TRUST_COOKIE);

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "trusted_device.revoke_all",
    entity: "TrustedDevice",
    entityId: target,
    after: { revoked: count },
  });

  revalidatePath("/security");
  return { revoked: count };
}
