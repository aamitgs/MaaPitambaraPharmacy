"use server";

import QRCode from "qrcode";
import { requireSession } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, totpUri, verifyTotpCode } from "@/lib/totp";
import { writeAuditLog } from "@/lib/audit";

export async function startMfaSetup() {
  const session = await requireSession();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const secret = user.totpEnabled ? null : (user.totpSecret ?? generateTotpSecret());
  if (!user.totpEnabled && secret !== user.totpSecret) {
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  }

  if (user.totpEnabled) {
    return { alreadyEnabled: true as const };
  }

  const uri = totpUri(secret!, `${user.email}`);
  const qrDataUrl = await QRCode.toDataURL(uri);

  return { alreadyEnabled: false as const, secret, qrDataUrl };
}

export async function confirmMfaSetup(code: string) {
  const session = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  if (!user.totpSecret) {
    return { ok: false as const, error: "No pending MFA setup. Start again." };
  }
  if (!verifyTotpCode(user.totpSecret, code)) {
    return { ok: false as const, error: "Invalid code. Check your authenticator app and try again." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await writeAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: "mfa.enabled",
    entity: "User",
    entityId: user.id,
    before: { totpEnabled: false },
    after: { totpEnabled: true },
  });

  return { ok: true as const };
}
