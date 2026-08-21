"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { LICENSE_TYPES, type LicenseType } from "@/lib/license-types";
import { getBranchFilter } from "@/lib/branch-scope";

const LICENSE_LABELS: Record<LicenseType, string> = {
  retail: "Retail drug license",
  wholesale: "Second drug license",
  narcotic: "Narcotic license",
  fssai: "FSSAI registration",
};

const LICENSE_NUMBER_FIELD: Record<LicenseType, "drugLicenseRetailNo" | "drugLicenseWholesaleNo" | "narcoticLicenseNo" | "fssaiNo"> = {
  retail: "drugLicenseRetailNo",
  wholesale: "drugLicenseWholesaleNo",
  narcotic: "narcoticLicenseNo",
  fssai: "fssaiNo",
};

export async function getAlerts() {
  const session = await requireSession();
  const tenantId = session.user.tenantId;

  // Low-stock/near-expiry reflect whichever branch is currently selected
  // (or every branch, consolidated, for Owner in "all branches" view) —
  // stock physically sitting at another branch shouldn't mask a shortage
  // at the one you're actually looking at.
  const branchFilter = await getBranchFilter(tenantId, session.user.role);

  const [items, tenant, branches] = await Promise.all([
    prisma.item.findMany({
      where: { tenantId },
      include: { batches: { where: branchFilter } },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.branch.findMany({ where: { tenantId } }),
  ]);

  const now = new Date();
  const nearExpiryCutoff = new Date(now.getTime() + tenant.nearExpiryWindowDays * 86400000);

  const lowStockEntries = items
    .map((item) => ({ item, totalQty: item.batches.reduce((sum, b) => sum + b.currentQty, 0) }))
    .filter(({ item, totalQty }) => totalQty < item.reorderLevel);

  const lowStockItemIds = lowStockEntries.map(({ item }) => item.id);
  const recentGrnItems = lowStockItemIds.length
    ? await prisma.grnItem.findMany({
        where: { itemId: { in: lowStockItemIds }, grn: { tenantId, ...branchFilter } },
        orderBy: { grn: { receivedAt: "desc" } },
        include: { grn: { include: { supplier: true } } },
      })
    : [];

  const lastPurchaseByItem = new Map<
    string,
    { rate: number; supplierId: string; supplierName: string }
  >();
  for (const gi of recentGrnItems) {
    if (!lastPurchaseByItem.has(gi.itemId)) {
      lastPurchaseByItem.set(gi.itemId, {
        rate: Number(gi.rate),
        supplierId: gi.grn.supplierId,
        supplierName: gi.grn.supplier.name,
      });
    }
  }

  const lowStock = lowStockEntries.map(({ item, totalQty }) => ({
    itemId: item.id,
    itemName: item.name,
    unit: item.unit,
    currentQty: totalQty,
    reorderLevel: item.reorderLevel,
    lastPurchase: lastPurchaseByItem.get(item.id) ?? null,
  }));

  const nearExpiry: {
    itemId: string;
    itemName: string;
    batchId: string;
    batchNo: string;
    expiryDate: Date;
    currentQty: number;
    isExpired: boolean;
  }[] = [];
  for (const item of items) {
    for (const batch of item.batches) {
      if (batch.currentQty > 0 && batch.expiryDate <= nearExpiryCutoff) {
        nearExpiry.push({
          itemId: item.id,
          itemName: item.name,
          batchId: batch.id,
          batchNo: batch.batchNo,
          expiryDate: batch.expiryDate,
          currentQty: batch.currentQty,
          isExpired: batch.expiryDate < now,
        });
      }
    }
  }
  nearExpiry.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

  const licenseExpiryCutoff = new Date(now.getTime() + tenant.licenseExpiryWindowDays * 86400000);
  const licenseExpiry: {
    branchId: string;
    branchName: string;
    licenseType: LicenseType;
    label: string;
    licenseNo: string | null;
    expiryDate: Date;
    daysRemaining: number;
    severity: "expired" | "urgent" | "upcoming";
  }[] = [];
  for (const branch of branches) {
    const dates = (branch.licenseExpiryDates ?? {}) as Partial<Record<LicenseType, string>>;
    for (const type of LICENSE_TYPES) {
      const raw = dates[type];
      if (!raw) continue;
      const expiryDate = new Date(raw);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate > licenseExpiryCutoff) continue;
      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
      licenseExpiry.push({
        branchId: branch.id,
        branchName: branch.name,
        licenseType: type,
        label: LICENSE_LABELS[type],
        licenseNo: branch[LICENSE_NUMBER_FIELD[type]],
        expiryDate,
        daysRemaining,
        severity: daysRemaining < 0 ? "expired" : daysRemaining <= 15 ? "urgent" : "upcoming",
      });
    }
  }
  licenseExpiry.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

  /**
   * Details a bill is required to carry that nobody has filled in.
   *
   * These were all optional columns rendered with `{x && ...}`, so a blank
   * one simply vanished from the bill — the pharmacy looked compliant on
   * screen while printing an incomplete document. Absence has to be
   * visible somewhere, and the alerts screen is where the rest of the
   * compliance nags already live.
   */
  const complianceGaps: { branchId: string; branchName: string; field: string; why: string }[] = [];
  for (const branch of branches) {
    if (!branch.pharmacistName) {
      complianceGaps.push({
        branchId: branch.id,
        branchName: branch.name,
        field: "Registered pharmacist",
        why: "A sale of prescription medicine is made under a registered pharmacist's supervision, and the bill should name them.",
      });
    }
    if (!branch.pharmacistRegistrationNo) {
      complianceGaps.push({
        branchId: branch.id,
        branchName: branch.name,
        field: "Pharmacist registration number",
        why: "The state pharmacy council number that makes the named pharmacist traceable.",
      });
    }
    if (!branch.gstin) {
      complianceGaps.push({
        branchId: branch.id,
        branchName: branch.name,
        field: "GSTIN",
        why: "Required on every tax invoice under Rule 46 of the CGST Rules.",
      });
    }
    if (!branch.drugLicenseRetailNo && !branch.drugLicenseWholesaleNo) {
      complianceGaps.push({
        branchId: branch.id,
        branchName: branch.name,
        field: "Drug licence number",
        why: "The Form 20/21 licence under which medicines are sold.",
      });
    }
  }

  return {
    lowStock,
    nearExpiry,
    nearExpiryWindowDays: tenant.nearExpiryWindowDays,
    licenseExpiry,
    licenseExpiryWindowDays: tenant.licenseExpiryWindowDays,
    complianceGaps,
  };
}
