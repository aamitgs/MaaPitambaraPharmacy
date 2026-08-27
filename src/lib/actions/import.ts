"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { validateRows, parseBoolean } from "@/lib/import/validate";
import { SCHEDULE_CLASSES, type ImportFieldKey } from "@/lib/import/fields";
import type { NormalizedRow } from "@/lib/import/normalize";
import { resolveConcreteBranch } from "@/lib/branch-scope";

export async function commitImport(rows: NormalizedRow[]) {
  const session = await requirePermission("data.import");
  const tenantId = session.user.tenantId;

  const branchId = await resolveConcreteBranch(tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this pharmacy yet.");

  // Re-validate server-side — never trust the client's preview pass.
  const { rows: validated } = validateRows(rows);
  const validRows = validated.filter((r) => r.errors.length === 0);

  // Loaded once rather than per row: a supplier name is matched against
  // whoever is already on file, never created on the fly here — that stays
  // the supplier import's job, so a typo in an item file can't silently
  // spawn a duplicate supplier.
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const supplierByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));

  let itemsCreated = 0;
  let itemsUpdated = 0;
  let batchesCreated = 0;
  let suppliersUnmatched = 0;

  for (const row of validRows) {
    const raw = row.raw;
    const name = raw.name!.trim();

    const existing = await prisma.item.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" } },
    });

    const scheduleClass =
      SCHEDULE_CLASSES.find((c) => c.toUpperCase() === raw.scheduleClass?.toUpperCase()) ?? "none";

    const looseSale = raw.allowLooseSale !== undefined ? parseBoolean(raw.allowLooseSale) : null;

    let supplierId: string | undefined;
    if (raw.supplierName?.trim()) {
      supplierId = supplierByName.get(raw.supplierName.trim().toLowerCase());
      if (!supplierId) suppliersUnmatched++;
    }

    const itemData = {
      genericName: raw.genericName,
      supplierId,
      manufacturer: raw.manufacturer,
      composition: raw.composition,
      scheduleClass,
      hsnCode: raw.hsnCode,
      taxRate: raw.taxRate !== undefined ? Number(raw.taxRate) : undefined,
      unit: raw.unit,
      packSize: raw.packSize,
      barcode: raw.barcode?.trim() || undefined,
      unitsPerPack: raw.unitsPerPack !== undefined ? Number(raw.unitsPerPack) : undefined,
      allowLooseSale: looseSale ?? undefined,
      reorderLevel: raw.reorderLevel !== undefined ? Number(raw.reorderLevel) : undefined,
    };

    const item = existing
      ? await prisma.item.update({ where: { id: existing.id }, data: itemData })
      : await prisma.item.create({
          data: {
            tenantId,
            name,
            genericName: raw.genericName,
            supplierId,
            manufacturer: raw.manufacturer,
            composition: raw.composition,
            scheduleClass,
            hsnCode: raw.hsnCode,
            taxRate: raw.taxRate !== undefined ? Number(raw.taxRate) : 0,
            unit: raw.unit ?? "unit",
            packSize: raw.packSize,
            barcode: raw.barcode?.trim() || undefined,
            unitsPerPack: raw.unitsPerPack !== undefined ? Number(raw.unitsPerPack) : undefined,
            allowLooseSale: looseSale ?? undefined,
            reorderLevel: raw.reorderLevel !== undefined ? Number(raw.reorderLevel) : 10,
          },
        });

    if (existing) itemsUpdated++;
    else itemsCreated++;

    if (row.hasBatch) {
      await prisma.batch.create({
        data: {
          itemId: item.id,
          branchId,
          batchNo: raw.batchNo!,
          mfgDate: raw.mfgDate ? new Date(raw.mfgDate) : null,
          expiryDate: new Date(raw.expiryDate!),
          mrp: Number(raw.mrp),
          purchaseRate: raw.purchaseRate !== undefined ? Number(raw.purchaseRate) : 0,
          saleRate: Number(raw.saleRate),
          currentQty: raw.currentQty !== undefined ? Number(raw.currentQty) : 0,
          looseUnits: raw.looseUnits !== undefined ? Number(raw.looseUnits) : 0,
          rackLocation: raw.rackLocation,
        },
      });
      batchesCreated++;
    }
  }

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "item.import",
    entity: "Item",
    entityId: "bulk",
    after: {
      itemsCreated,
      itemsUpdated,
      batchesCreated,
      suppliersUnmatched,
      rowsSubmitted: rows.length,
    },
  });

  revalidatePath("/items");

  return {
    itemsCreated,
    itemsUpdated,
    batchesCreated,
    suppliersUnmatched,
    skipped: rows.length - validRows.length,
  };
}

export type { ImportFieldKey };
