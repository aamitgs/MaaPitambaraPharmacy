"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { validateRows } from "@/lib/import/validate";
import { SCHEDULE_CLASSES, type ImportFieldKey } from "@/lib/import/fields";
import type { NormalizedRow } from "@/lib/import/normalize";
import { resolveConcreteBranch } from "@/lib/branch-scope";

export async function commitImport(rows: NormalizedRow[]) {
  const session = await requireRole(["owner", "pharmacist"]);
  const tenantId = session.user.tenantId;

  const branchId = await resolveConcreteBranch(tenantId, session.user.role);
  if (!branchId) throw new Error("No branch configured for this pharmacy yet.");

  // Re-validate server-side — never trust the client's preview pass.
  const { rows: validated } = validateRows(rows);
  const validRows = validated.filter((r) => r.errors.length === 0);

  let itemsCreated = 0;
  let itemsUpdated = 0;
  let batchesCreated = 0;

  for (const row of validRows) {
    const raw = row.raw;
    const name = raw.name!.trim();

    const existing = await prisma.item.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" } },
    });

    const scheduleClass =
      SCHEDULE_CLASSES.find((c) => c.toUpperCase() === raw.scheduleClass?.toUpperCase()) ?? "none";

    const itemData = {
      genericName: raw.genericName,
      manufacturer: raw.manufacturer,
      composition: raw.composition,
      scheduleClass,
      hsnCode: raw.hsnCode,
      taxRate: raw.taxRate !== undefined ? Number(raw.taxRate) : undefined,
      unit: raw.unit,
      packSize: raw.packSize,
      reorderLevel: raw.reorderLevel !== undefined ? Number(raw.reorderLevel) : undefined,
    };

    const item = existing
      ? await prisma.item.update({ where: { id: existing.id }, data: itemData })
      : await prisma.item.create({
          data: {
            tenantId,
            name,
            genericName: raw.genericName,
            manufacturer: raw.manufacturer,
            composition: raw.composition,
            scheduleClass,
            hsnCode: raw.hsnCode,
            taxRate: raw.taxRate !== undefined ? Number(raw.taxRate) : 0,
            unit: raw.unit ?? "unit",
            packSize: raw.packSize,
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
    after: { itemsCreated, itemsUpdated, batchesCreated, rowsSubmitted: rows.length },
  });

  revalidatePath("/items");

  return { itemsCreated, itemsUpdated, batchesCreated, skipped: rows.length - validRows.length };
}

export type { ImportFieldKey };
