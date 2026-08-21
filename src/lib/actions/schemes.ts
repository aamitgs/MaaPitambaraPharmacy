"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import type { SchemeDef } from "@/lib/scheme-engine";

const schemeConfigSchema = z.object({
  percent: z.coerce.number().min(0).max(100).optional(),
  buyQty: z.coerce.number().int().positive().optional(),
  getQty: z.coerce.number().int().positive().optional(),
  applicableItemIds: z.array(z.string()).optional(),
});

const schemeSchema = z
  .object({
    name: z.string().trim().min(1, "Scheme name is required"),
    type: z.enum(["percent_off", "buy_x_get_y"]),
    config: schemeConfigSchema,
    validFrom: z.string().min(1),
    validTo: z.string().min(1),
    active: z.boolean().default(true),
  })
  .refine((v) => (v.type === "percent_off" ? v.config.percent !== undefined : true), {
    message: "Percent is required for a percent-off scheme",
    path: ["config", "percent"],
  })
  .refine(
    (v) =>
      v.type === "buy_x_get_y" ? v.config.buyQty !== undefined && v.config.getQty !== undefined : true,
    { message: "Buy qty and get qty are required for a buy-X-get-Y scheme", path: ["config", "buyQty"] }
  );

export type SchemeInput = z.infer<typeof schemeSchema>;

function serializeScheme(s: {
  id: string;
  name: string;
  type: string;
  config: unknown;
  validFrom: Date;
  validTo: Date;
  active: boolean;
}) {
  return {
    id: s.id,
    name: s.name,
    type: s.type as "percent_off" | "buy_x_get_y",
    config: s.config as Record<string, unknown>,
    validFrom: s.validFrom.toISOString(),
    validTo: s.validTo.toISOString(),
    active: s.active,
  };
}

/** Lightweight item list for the scheme form's item-scope picker. */
export async function listItemNamesForSchemes() {
  const session = await requirePermission("promotions.manage");
  return prisma.item.findMany({
    where: { tenantId: session.user.tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listSchemes() {
  const session = await requirePermission("promotions.manage");
  const schemes = await prisma.scheme.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { validFrom: "desc" },
  });
  return schemes.map(serializeScheme);
}

/** Active, in-date schemes only — what the POS billing screen auto-applies against the cart. */
export async function listActiveSchemesForBilling(tenantId: string): Promise<SchemeDef[]> {
  const now = new Date();
  const schemes = await prisma.scheme.findMany({
    where: { tenantId, active: true, validFrom: { lte: now }, validTo: { gte: now } },
  });
  return schemes.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type as "percent_off" | "buy_x_get_y",
    config: s.config as SchemeDef["config"],
  }));
}

export async function createScheme(input: SchemeInput) {
  const session = await requirePermission("promotions.manage");
  const parsed = schemeSchema.parse(input);

  const scheme = await prisma.scheme.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      type: parsed.type,
      config: parsed.config,
      validFrom: new Date(parsed.validFrom),
      validTo: new Date(parsed.validTo),
      active: parsed.active,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "scheme.create",
    entity: "Scheme",
    entityId: scheme.id,
    after: { name: scheme.name, type: scheme.type },
  });

  revalidatePath("/schemes");
  return { id: scheme.id };
}

export async function updateScheme(schemeId: string, input: SchemeInput) {
  const session = await requirePermission("promotions.manage");
  const parsed = schemeSchema.parse(input);

  const scheme = await prisma.scheme.findFirst({
    where: { id: schemeId, tenantId: session.user.tenantId },
  });
  if (!scheme) throw new Error("Scheme not found");

  await prisma.scheme.update({
    where: { id: scheme.id },
    data: {
      name: parsed.name,
      type: parsed.type,
      config: parsed.config,
      validFrom: new Date(parsed.validFrom),
      validTo: new Date(parsed.validTo),
      active: parsed.active,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "scheme.update",
    entity: "Scheme",
    entityId: scheme.id,
    after: { name: parsed.name, type: parsed.type, active: parsed.active },
  });

  revalidatePath("/schemes");
}

export async function getScheme(schemeId: string) {
  const session = await requirePermission("promotions.manage");
  const scheme = await prisma.scheme.findFirst({
    where: { id: schemeId, tenantId: session.user.tenantId },
  });
  return scheme ? serializeScheme(scheme) : null;
}
