"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { verifyTotpCode } from "@/lib/totp";
import { lockRemainingSeconds } from "@/lib/login-throttle";
import { writeAuditLog } from "@/lib/audit";
import { revokeAllForUser } from "@/lib/trusted-device-store";
import { PERMISSION_KEYS, SYSTEM_ROLE_NAMES, SYSTEM_ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import type { UserRole } from "@/generated/prisma/client";

/**
 * Staff and role administration. Every action here is hard-gated to the
 * owner rather than to a permission: an owner who could grant this away
 * could be locked out of their own pharmacy by someone they promoted.
 */
const ownerOnly = () => requireRole(["owner"]);

/** Password + authenticator code, re-entered for each privileged change. */
export type StepUp = { password: string; totpCode: string };

const stepUpSchema = z.object({
  password: z.string().min(1, "Enter your password"),
  totpCode: z.string().trim().length(6, "Enter the 6-digit code"),
});

/**
 * Step-up authentication for anything that grants or removes access.
 *
 * Being signed in is not enough here: an unattended till with an owner
 * session open would otherwise be enough to create an account. Both factors
 * are re-checked server-side against the owner's own credentials — the
 * client is never trusted to report that it asked.
 */
async function requireOwnerStepUp(reauth: StepUp) {
  const session = await ownerOnly();
  const parsed = stepUpSchema.parse(reauth);

  const me = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { passwordHash: true, totpSecret: true, totpEnabled: true },
  });

  if (!(await bcrypt.compare(parsed.password, me.passwordHash))) {
    throw new Error("That password is incorrect");
  }
  if (!me.totpEnabled || !me.totpSecret) {
    throw new Error("Set up your authenticator app before managing staff");
  }
  if (!verifyTotpCode(me.totpSecret, parsed.totpCode)) {
    throw new Error("That authenticator code is invalid or expired");
  }
  return session;
}

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleId: string | null;
  roleName: string;
  isActive: boolean;
  totpEnabled: boolean;
  isSelf: boolean;
  /** Seconds still to wait, 0 when not locked out. */
  lockedForSeconds: number;
  failedLoginCount: number;
};

export type RoleSummary = {
  id: string;
  name: string;
  permissions: Permission[];
  isSystem: boolean;
  memberCount: number;
};

/** Creates the three shipped roles on first use, matching today's behaviour. */
async function ensureSystemRoles(tenantId: string) {
  const existing = await prisma.role.findMany({ where: { tenantId, isSystem: true } });
  if (existing.length >= 3) return existing;

  for (const role of ["owner", "pharmacist", "counter_staff"] as UserRole[]) {
    await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: SYSTEM_ROLE_NAMES[role] } },
      update: {},
      create: {
        tenantId,
        name: SYSTEM_ROLE_NAMES[role],
        permissions: SYSTEM_ROLE_PERMISSIONS[role],
        isSystem: true,
      },
    });
  }
  return prisma.role.findMany({ where: { tenantId, isSystem: true } });
}

export async function listStaff(): Promise<StaffMember[]> {
  const session = await ownerOnly();
  await ensureSystemRoles(session.user.tenantId);

  const users = await prisma.user.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { roleRef: { select: { id: true, name: true } } },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    roleId: u.roleId,
    roleName: u.roleRef?.name ?? SYSTEM_ROLE_NAMES[u.role],
    isActive: u.isActive,
    totpEnabled: u.totpEnabled,
    isSelf: u.id === session.user.id,
    lockedForSeconds: lockRemainingSeconds(u),
    failedLoginCount: u.failedLoginCount,
  }));
}

export async function listRoles(): Promise<RoleSummary[]> {
  const session = await ownerOnly();
  await ensureSystemRoles(session.user.tenantId);

  const roles = await prisma.role.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });

  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    permissions: r.permissions as Permission[],
    isSystem: r.isSystem,
    memberCount: r._count.users,
  }));
}

const staffSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["owner", "pharmacist", "counter_staff"]),
  roleId: z.string().optional().nullable(),
  password: z.string().min(8, "Use at least 8 characters").optional(),
});

export async function createStaff(input: z.infer<typeof staffSchema>, reauth: StepUp) {
  const session = await requireOwnerStepUp(reauth);
  const parsed = staffSchema.parse(input);
  if (!parsed.password) throw new Error("A password is required for a new staff member");

  const clash = await prisma.user.findFirst({
    where: { tenantId: session.user.tenantId, email: parsed.email.toLowerCase() },
  });
  if (clash) throw new Error("Someone already uses that email address");

  await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      role: parsed.role,
      roleId: parsed.roleId || null,
      passwordHash: await bcrypt.hash(parsed.password, 10),
    },
  });
  revalidatePath("/staff");
}

export async function updateStaff(id: string, input: z.infer<typeof staffSchema>, reauth: StepUp) {
  const session = await requireOwnerStepUp(reauth);
  const parsed = staffSchema.parse(input);

  const target = await prisma.user.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!target) throw new Error("Staff member not found");

  // Guard against the last owner demoting themselves out of existence.
  if (target.role === "owner" && parsed.role !== "owner") {
    const owners = await prisma.user.count({
      where: { tenantId: session.user.tenantId, role: "owner", isActive: true },
    });
    if (owners <= 1) throw new Error("This is the only owner — promote someone else first");
  }

  await prisma.user.update({
    where: { id },
    data: {
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      role: parsed.role,
      roleId: parsed.roleId || null,
      ...(parsed.password ? { passwordHash: await bcrypt.hash(parsed.password, 10) } : {}),
    },
  });

  // A password the owner has just reset invalidates any standing decision
  // to skip the second factor on that account.
  if (parsed.password) await revokeAllForUser(id);

  revalidatePath("/staff");
}

export async function setStaffActive(id: string, isActive: boolean, reauth: StepUp) {
  const session = await requireOwnerStepUp(reauth);
  if (id === session.user.id) throw new Error("You cannot deactivate your own account");

  const target = await prisma.user.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!target) throw new Error("Staff member not found");

  await prisma.user.update({ where: { id }, data: { isActive } });
  revalidatePath("/staff");
}

/** Clears MFA so the next sign-in enrols afresh — the lost-phone path. */
export async function resetStaffMfa(id: string, reauth: StepUp) {
  const session = await requireOwnerStepUp(reauth);
  const target = await prisma.user.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!target) throw new Error("Staff member not found");

  await prisma.user.update({
    where: { id },
    data: { totpSecret: null, totpEnabled: false },
  });

  // The lost-phone path. Any device still skipping the code was trusted
  // using the authenticator that has just been thrown away, so the trust
  // goes with it — otherwise a lost phone leaves a standing bypass.
  await revokeAllForUser(id);

  revalidatePath("/staff");
}

const roleSchema = z.object({
  name: z.string().trim().min(1, "Name the role").max(40),
  permissions: z.array(z.enum(PERMISSION_KEYS as [Permission, ...Permission[]])),
});

export async function createRole(input: z.infer<typeof roleSchema>, reauth: StepUp) {
  const session = await requireOwnerStepUp(reauth);
  const parsed = roleSchema.parse(input);
  await prisma.role.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      permissions: parsed.permissions,
    },
  });
  revalidatePath("/staff");
}

export async function updateRole(id: string, input: z.infer<typeof roleSchema>, reauth: StepUp) {
  const session = await requireOwnerStepUp(reauth);
  const parsed = roleSchema.parse(input);

  const role = await prisma.role.findFirst({ where: { id, tenantId: session.user.tenantId } });
  if (!role) throw new Error("Role not found");

  await prisma.role.update({
    where: { id },
    data: {
      // A system role's permissions stay editable; its name does not, so the
      // three shipped roles remain recognisable.
      name: role.isSystem ? role.name : parsed.name,
      permissions: parsed.permissions,
    },
  });
  revalidatePath("/staff");
}

export async function deleteRole(id: string, reauth: StepUp) {
  const session = await requireOwnerStepUp(reauth);
  const role = await prisma.role.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("The three built-in roles cannot be deleted");
  if (role._count.users > 0) {
    throw new Error(`${role._count.users} staff still hold this role — reassign them first`);
  }

  await prisma.role.delete({ where: { id } });
  revalidatePath("/staff");
}

/** Used by the sign-in flow to keep deactivated staff out. */
export async function isUserActive(userId: string) {
  await requireSession();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  return user?.isActive ?? false;
}

/**
 * Counter limits — the authority controls. These moved here from Settings
 * because they answer the same question the rest of this screen does: what
 * a member of staff may do on their own, and what unlocks the exception.
 * Leaving the manager PIN behind a plain Save button while adding a user
 * needed password + OTP was the inconsistency worth closing.
 */
export type CounterLimits = {
  staffDiscountCapPercent: number;
  salesReturnWindowDays: number;
  hasManagerPin: boolean;
};

export async function getCounterLimits(): Promise<CounterLimits> {
  const session = await ownerOnly();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.user.tenantId },
    select: {
      staffDiscountCapPercent: true,
      salesReturnWindowDays: true,
      managerPinHash: true,
    },
  });
  return {
    staffDiscountCapPercent: Number(tenant.staffDiscountCapPercent),
    salesReturnWindowDays: tenant.salesReturnWindowDays,
    hasManagerPin: Boolean(tenant.managerPinHash),
  };
}

const counterLimitsSchema = z.object({
  staffDiscountCapPercent: z.coerce.number().min(0).max(100),
  // 0 switches customer returns off entirely, which is a legitimate policy.
  salesReturnWindowDays: z.coerce.number().int().min(0).max(365),
  /** Blank leaves the existing PIN alone. */
  managerPin: z.string().trim().optional(),
});

export async function updateCounterLimits(
  input: z.infer<typeof counterLimitsSchema>,
  reauth: StepUp
) {
  const session = await requireOwnerStepUp(reauth);
  const parsed = counterLimitsSchema.parse(input);

  if (parsed.managerPin && parsed.managerPin.length < 4) {
    throw new Error("Use at least 4 digits for the manager PIN");
  }

  const before = await prisma.tenant.findUniqueOrThrow({
    where: { id: session.user.tenantId },
    select: { staffDiscountCapPercent: true, salesReturnWindowDays: true },
  });

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      staffDiscountCapPercent: parsed.staffDiscountCapPercent,
      salesReturnWindowDays: parsed.salesReturnWindowDays,
      ...(parsed.managerPin
        ? { managerPinHash: await bcrypt.hash(parsed.managerPin, 10) }
        : {}),
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "settings.counterLimits.update",
    entity: "Tenant",
    entityId: session.user.tenantId,
    before: {
      staffDiscountCapPercent: Number(before.staffDiscountCapPercent),
      salesReturnWindowDays: before.salesReturnWindowDays,
    },
    after: {
      staffDiscountCapPercent: parsed.staffDiscountCapPercent,
      salesReturnWindowDays: parsed.salesReturnWindowDays,
      managerPinChanged: Boolean(parsed.managerPin),
    },
  });

  revalidatePath("/staff");
  // The till reads the cap and the window when it loads.
  revalidatePath("/billing");
}

/**
 * Clears a lockout early. No step-up: this grants nothing an attacker
 * wants — it only lets somebody try their own password again — and needing
 * the owner's authenticator to unstick a member of staff mid-shift is the
 * kind of friction that ends with the PIN written on a note by the till.
 */
export async function unlockStaffAccount(id: string) {
  const session = await ownerOnly();
  const user = await prisma.user.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, name: true, failedLoginCount: true },
  });
  if (!user) throw new Error("Staff member not found");

  await prisma.user.update({
    where: { id },
    data: { failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "staff.unlock",
    entity: "User",
    entityId: id,
    before: { failedLoginCount: user.failedLoginCount },
    after: { unlockedBy: session.user.id, name: user.name },
  });

  revalidatePath("/staff");
}
