import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { judgeTrust, hashDeviceToken, TRUST_COOKIE } from "@/lib/trusted-device";

/**
 * Does the browser signing in hold a live trust for this account?
 *
 * Called during sign-in, after the password has already been checked. A
 * "true" here waives the one-time code and nothing else.
 *
 * Fails closed: any lookup problem means the code is asked for. The cost of
 * a false "no" is one OTP; the cost of a false "yes" is a bypassed factor.
 */
export async function deviceIsTrusted(userId: string): Promise<boolean> {
  try {
    const jar = await cookies();
    const token = jar.get(TRUST_COOKIE)?.value;
    if (!token) return false;

    const record = await prisma.trustedDevice.findUnique({
      where: { tokenHash: hashDeviceToken(token) },
      select: { id: true, userId: true, expiresAt: true, revokedAt: true },
    });

    const verdict = judgeTrust(record, userId);
    if (!verdict.trusted) return false;

    // Best-effort: the security screen shows when a device was last used,
    // but failing to stamp it must never fail the sign-in.
    prisma.trustedDevice
      .update({ where: { id: record!.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return true;
  } catch {
    return false;
  }
}

/**
 * Drops every trust on an account, without needing to be that account.
 *
 * Used when the credentials behind the original decision have changed —
 * a password reset or an MFA reset. Whoever trusted the device did so with
 * an authentication that no longer applies, so the trust goes with it.
 */
export async function revokeAllForUser(userId: string): Promise<number> {
  const { count } = await prisma.trustedDevice.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}
