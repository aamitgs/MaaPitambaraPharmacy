"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import {
  validatePartyRows,
  type PartyKind,
  type PartyRow,
} from "@/lib/import/party-fields";

/**
 * Bulk-loading suppliers and customers.
 *
 * Matched on name, case-insensitively, because that is the only identifier
 * a distributor's spreadsheet reliably carries — GSTIN is often blank and
 * phone numbers move. Matching means an import run twice updates rather
 * than duplicating, which matters because the second run is usually a
 * correction of the first.
 */

/** Existing names, for the preview to show create-vs-update honestly. */
export async function getExistingPartyNames(kind: PartyKind): Promise<string[]> {
  const session = await requirePermission("data.import");
  const tenantId = session.user.tenantId;
  const rows =
    kind === "supplier"
      ? await prisma.supplier.findMany({ where: { tenantId }, select: { name: true } })
      : await prisma.customer.findMany({ where: { tenantId }, select: { name: true } });
  return rows.map((r) => r.name.toLowerCase());
}

export async function commitPartyImport(kind: PartyKind, rows: PartyRow[]) {
  const session = await requirePermission("data.import");
  const tenantId = session.user.tenantId;

  const existing = new Set(await getExistingPartyNames(kind));
  // Re-validated server-side — the client's preview is never the gate.
  const validated = validatePartyRows(kind, rows, existing);
  const valid = validated.filter((r) => r.errors.length === 0);

  let created = 0;
  let updated = 0;

  for (const row of valid) {
    const raw = row.raw;
    const name = raw.name!.trim();
    const num = (v: string | undefined) =>
      v?.trim() ? Number(v) : undefined;

    if (kind === "supplier") {
      const match = await prisma.supplier.findFirst({
        where: { tenantId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      const data = {
        phone: raw.phone?.trim() || undefined,
        gstin: raw.gstin?.trim()?.toUpperCase() || undefined,
        address: raw.address?.trim() || undefined,
        paymentTermsDays: num(raw.paymentTermsDays),
      };
      if (match) {
        await prisma.supplier.update({ where: { id: match.id }, data });
        updated++;
      } else {
        await prisma.supplier.create({ data: { tenantId, name, ...data } });
        created++;
      }
    } else {
      const match = await prisma.customer.findFirst({
        where: { tenantId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      const data = {
        phone: raw.phone?.trim() || undefined,
        creditLimit: num(raw.creditLimit),
        creditTermDays: num(raw.creditTermDays),
      };
      if (match) {
        await prisma.customer.update({ where: { id: match.id }, data });
        updated++;
      } else {
        await prisma.customer.create({ data: { tenantId, name, ...data } });
        created++;
      }
    }
  }

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: `${kind}.import`,
    entity: kind === "supplier" ? "Supplier" : "Customer",
    entityId: "bulk",
    after: { created, updated, rowsSubmitted: rows.length, skipped: rows.length - valid.length },
  });

  revalidatePath(kind === "supplier" ? "/suppliers" : "/customers");
  return { created, updated, skipped: rows.length - valid.length };
}
