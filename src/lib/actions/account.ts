"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { revokeAllForUser } from "@/lib/trusted-device-store";

/**
 * Your own account. Deliberately separate from staff administration: the
 * owner resetting somebody else's password is an administrative act that
 * needs step-up, but a member of staff changing their own — having proved
 * they know the current one — is not.
 *
 * Before this existed, nobody could change their own password at all. Every
 * account was stuck on whatever the owner first typed, which in practice
 * means the seeded password, shared and never rotated.
 */

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(200)
      // Long enough to matter, but not a rule so fussy that staff write the
      // password on the counter to remember it.
      .refine((v) => !/^\d+$/.test(v), "Use more than just digits"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "The two new passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "The new password must be different from the current one",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof schema>;

export async function changeOwnPassword(input: ChangePasswordInput) {
  const session = await requireSession();
  const parsed = schema.parse(input);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  if (!(await bcrypt.compare(parsed.currentPassword, user.passwordHash))) {
    throw new Error("That is not your current password");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await bcrypt.hash(parsed.newPassword, 10) },
  });

  // Every device that was skipping the OTP starts being asked again. The
  // decision to trust them was made under the old password; a password
  // change is usually a response to that password being at risk.
  const untrusted = await revokeAllForUser(session.user.id);

  // The hash is never logged, only the fact and the time — enough to answer
  // "when did this account last change its password".
  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "account.passwordChange",
    entity: "User",
    entityId: session.user.id,
    after: { changedAt: new Date().toISOString(), self: true, trustedDevicesCleared: untrusted },
  });

  return { ok: true as const };
}
