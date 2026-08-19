"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import type { LicenseType } from "@/lib/license-types";

export async function listBranches() {
  const session = await requireSession();
  const branches = await prisma.branch.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });
  return branches.map((b) => ({ id: b.id, name: b.name, licensedAddress: b.licensedAddress }));
}

const branchFieldsSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required"),
  licensedAddress: z.string().trim().min(1, "Licensed address is required"),
  phone: z.string().trim().max(20).optional(),
  landline: z.string().trim().max(20).optional(),
  gstin: z.string().trim().optional(),
  pan: z.string().trim().optional(),
  drugLicenseRetailNo: z.string().trim().optional(),
  drugLicenseWholesaleNo: z.string().trim().optional(),
  narcoticLicenseNo: z.string().trim().optional(),
  fssaiNo: z.string().trim().optional(),
  pharmacistName: z.string().trim().optional(),
  pharmacistRegistrationNo: z.string().trim().optional(),
  licenseExpiryDates: z
    .object({
      retail: z.string().optional(),
      wholesale: z.string().optional(),
      narcotic: z.string().optional(),
      fssai: z.string().optional(),
    })
    .optional(),
  einvoiceEnabled: z.boolean().default(false),
  ewayBillThreshold: z.coerce.number().min(0).default(50000),
});

export type BranchFieldsInput = z.infer<typeof branchFieldsSchema>;

/** Opening a second (or third...) branch is an ownership decision, not day-to-day compliance upkeep. */
export async function createBranch(input: BranchFieldsInput) {
  const session = await requireRole(["owner"]);
  const parsed = branchFieldsSchema.parse(input);
  const cleanExpiryDates = parsed.licenseExpiryDates
    ? Object.fromEntries(Object.entries(parsed.licenseExpiryDates).filter(([, v]) => v))
    : undefined;

  const branch = await prisma.branch.create({
    data: {
      tenantId: session.user.tenantId,
      name: parsed.name,
      licensedAddress: parsed.licensedAddress,
      phone: parsed.phone || null,
      landline: parsed.landline || null,
      gstin: parsed.gstin || null,
      pan: parsed.pan || null,
      drugLicenseRetailNo: parsed.drugLicenseRetailNo || null,
      drugLicenseWholesaleNo: parsed.drugLicenseWholesaleNo || null,
      narcoticLicenseNo: parsed.narcoticLicenseNo || null,
      fssaiNo: parsed.fssaiNo || null,
      pharmacistName: parsed.pharmacistName || null,
      pharmacistRegistrationNo: parsed.pharmacistRegistrationNo || null,
      licenseExpiryDates: cleanExpiryDates ?? {},
      einvoiceEnabled: parsed.einvoiceEnabled,
      ewayBillThreshold: parsed.ewayBillThreshold,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "branch.create",
    entity: "Branch",
    entityId: branch.id,
    after: { name: branch.name },
  });

  revalidatePath("/branches");
  return { id: branch.id };
}

export async function getBranch(branchId: string) {
  const session = await requireRole(["owner", "pharmacist"]);
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: session.user.tenantId },
  });
  if (!branch) return null;

  const expiryDates = (branch.licenseExpiryDates ?? {}) as Partial<Record<LicenseType, string>>;
  return {
    id: branch.id,
    name: branch.name,
    licensedAddress: branch.licensedAddress,
    phone: branch.phone,
    landline: branch.landline,
    gstin: branch.gstin,
    pan: branch.pan,
    drugLicenseRetailNo: branch.drugLicenseRetailNo,
    drugLicenseWholesaleNo: branch.drugLicenseWholesaleNo,
    narcoticLicenseNo: branch.narcoticLicenseNo,
    fssaiNo: branch.fssaiNo,
    pharmacistName: branch.pharmacistName,
    pharmacistRegistrationNo: branch.pharmacistRegistrationNo,
    licenseExpiryDates: expiryDates,
    einvoiceEnabled: branch.einvoiceEnabled,
    ewayBillThreshold: Number(branch.ewayBillThreshold),
  };
}

/** Editing an existing branch's compliance profile is day-to-day upkeep — Owner or Pharmacist, matching the rest of the compliance surface. */
export async function updateBranch(branchId: string, input: BranchFieldsInput) {
  const session = await requireRole(["owner", "pharmacist"]);
  const parsed = branchFieldsSchema.parse(input);

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: session.user.tenantId },
  });
  if (!branch) throw new Error("Branch not found");

  const before = {
    name: branch.name,
    licensedAddress: branch.licensedAddress,
    phone: branch.phone,
    landline: branch.landline,
    gstin: branch.gstin,
    pan: branch.pan,
    drugLicenseRetailNo: branch.drugLicenseRetailNo,
    drugLicenseWholesaleNo: branch.drugLicenseWholesaleNo,
    narcoticLicenseNo: branch.narcoticLicenseNo,
    fssaiNo: branch.fssaiNo,
    licenseExpiryDates: branch.licenseExpiryDates,
  };

  const cleanExpiryDates = parsed.licenseExpiryDates
    ? Object.fromEntries(Object.entries(parsed.licenseExpiryDates).filter(([, v]) => v))
    : {};

  await prisma.branch.update({
    where: { id: branch.id },
    data: {
      name: parsed.name,
      licensedAddress: parsed.licensedAddress,
      phone: parsed.phone || null,
      landline: parsed.landline || null,
      gstin: parsed.gstin || null,
      pan: parsed.pan || null,
      drugLicenseRetailNo: parsed.drugLicenseRetailNo || null,
      drugLicenseWholesaleNo: parsed.drugLicenseWholesaleNo || null,
      narcoticLicenseNo: parsed.narcoticLicenseNo || null,
      fssaiNo: parsed.fssaiNo || null,
      pharmacistName: parsed.pharmacistName || null,
      pharmacistRegistrationNo: parsed.pharmacistRegistrationNo || null,
      licenseExpiryDates: cleanExpiryDates,
      einvoiceEnabled: parsed.einvoiceEnabled,
      ewayBillThreshold: parsed.ewayBillThreshold,
    },
  });

  await writeAuditLog({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "branch.update",
    entity: "Branch",
    entityId: branch.id,
    before,
    after: { ...parsed, licenseExpiryDates: cleanExpiryDates },
  });

  revalidatePath("/branches");
  revalidatePath(`/branches/${branch.id}`);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}
