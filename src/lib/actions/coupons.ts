"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

function serializeCoupon(c: {
  id: string;
  code: string;
  type: string;
  value: unknown;
  validFrom: Date;
  validTo: Date;
  usageLimit: number | null;
  usageCount: number;
  singleUsePerCustomer: boolean;
}) {
  return {
    id: c.id,
    code: c.code,
    type: c.type as "percent" | "flat",
    value: Number(c.value),
    validFrom: c.validFrom.toISOString(),
    validTo: c.validTo.toISOString(),
    usageLimit: c.usageLimit,
    usageCount: c.usageCount,
    singleUsePerCustomer: c.singleUsePerCustomer,
  };
}

export async function listCoupons() {
  const session = await requirePermission("promotions.manage");
  const coupons = await prisma.coupon.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { validFrom: "desc" },
  });
  return coupons.map(serializeCoupon);
}

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .transform((v) => v.toUpperCase()),
  type: z.enum(["percent", "flat"]),
  value: z.coerce.number().positive(),
  validFrom: z.string().min(1),
  validTo: z.string().min(1),
  usageLimit: z.coerce.number().int().positive().optional(),
  singleUsePerCustomer: z.boolean().default(false),
});

export type CouponInput = z.infer<typeof couponSchema>;

export async function createCoupon(input: CouponInput) {
  const session = await requirePermission("promotions.manage");
  const parsed = couponSchema.parse(input);

  const existing = await prisma.coupon.findFirst({
    where: { tenantId: session.user.tenantId, code: parsed.code },
  });
  if (existing) throw new Error(`Coupon code "${parsed.code}" already exists.`);

  const coupon = await prisma.coupon.create({
    data: {
      tenantId: session.user.tenantId,
      code: parsed.code,
      type: parsed.type,
      value: parsed.value,
      validFrom: new Date(parsed.validFrom),
      validTo: new Date(parsed.validTo),
      usageLimit: parsed.usageLimit ?? null,
      singleUsePerCustomer: parsed.singleUsePerCustomer,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "coupon.create",
    entity: "Coupon",
    entityId: coupon.id,
    after: { code: coupon.code, type: coupon.type, value: parsed.value },
  });

  revalidatePath("/coupons");
  return { id: coupon.id };
}

export async function updateCoupon(couponId: string, input: CouponInput) {
  const session = await requirePermission("promotions.manage");
  const parsed = couponSchema.parse(input);

  const coupon = await prisma.coupon.findFirst({
    where: { id: couponId, tenantId: session.user.tenantId },
  });
  if (!coupon) throw new Error("Coupon not found");

  const duplicate = await prisma.coupon.findFirst({
    where: { tenantId: session.user.tenantId, code: parsed.code, NOT: { id: coupon.id } },
  });
  if (duplicate) throw new Error(`Coupon code "${parsed.code}" already exists.`);

  await prisma.coupon.update({
    where: { id: coupon.id },
    data: {
      code: parsed.code,
      type: parsed.type,
      value: parsed.value,
      validFrom: new Date(parsed.validFrom),
      validTo: new Date(parsed.validTo),
      usageLimit: parsed.usageLimit ?? null,
      singleUsePerCustomer: parsed.singleUsePerCustomer,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "coupon.update",
    entity: "Coupon",
    entityId: coupon.id,
    after: { code: parsed.code, type: parsed.type, value: parsed.value },
  });

  revalidatePath("/coupons");
}

export interface CouponValidationResult {
  valid: boolean;
  error?: string;
  coupon?: { id: string; code: string; type: "percent" | "flat"; value: number };
}

/**
 * Validates a coupon at billing time — active window, usage limit, and
 * (if singleUsePerCustomer) whether this specific customer already has a
 * "coupon"-type Discount referencing it on a completed invoice. Read-only:
 * usageCount is only incremented by completeSale on actual sale completion,
 * never here, so re-checking a code doesn't consume it.
 */
export async function validateCoupon(code: string, customerId: string | null): Promise<CouponValidationResult> {
  const session = await requireSession();
  const now = new Date();
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { valid: false, error: "Enter a coupon code." };

  const coupon = await prisma.coupon.findFirst({
    where: { tenantId: session.user.tenantId, code: normalized },
  });
  if (!coupon) return { valid: false, error: "Coupon code not found." };
  if (now < coupon.validFrom || now > coupon.validTo) {
    return { valid: false, error: "Coupon is outside its valid date range." };
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, error: "Coupon usage limit reached." };
  }
  if (coupon.singleUsePerCustomer) {
    if (!customerId) {
      return { valid: false, error: "Select a customer to use this single-use coupon." };
    }
    const alreadyUsed = await prisma.discount.findFirst({
      where: { couponId: coupon.id, invoice: { customerId } },
    });
    if (alreadyUsed) return { valid: false, error: "This customer has already used this coupon." };
  }

  return {
    valid: true,
    coupon: { id: coupon.id, code: coupon.code, type: coupon.type as "percent" | "flat", value: Number(coupon.value) },
  };
}
