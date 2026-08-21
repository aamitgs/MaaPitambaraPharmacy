import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole, UnauthorizedError } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { BACKUP_TABLES } from "@/lib/backup-schema";
import { readTable } from "@/lib/backup-tables";
import { buildWorkbook, workbookHeaders, type Sheet } from "@/lib/xlsx";
import { redactValue, cellValue, type RedactionMode } from "@/lib/data-workbook";

/**
 * A readable copy of the pharmacy's data.
 *
 * Explicitly NOT a backup, and named so throughout. The encrypted backup
 * exists to be restored; this exists to be read — by an accountant, or by
 * anyone who wants to see what the system holds without trusting it. The
 * two are not interchangeable, and a workbook cannot be restored: thirty-odd
 * tables of foreign keys do not survive a round trip through spreadsheets.
 *
 * Owner-only, audited, and personal data is redacted unless asked for.
 * Credentials are never included at all.
 *
 * Table coverage comes from the backup manifest, so a model added to the
 * schema appears here automatically once it is added there — and the guard
 * test makes sure it is.
 */
export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireRole(["owner"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Only the owner can export the pharmacy's data." },
        { status: 403 }
      );
    }
    throw e;
  }

  const tenantId = session.user.tenantId;
  const mode: RedactionMode =
    request.nextUrl.searchParams.get("personal") === "include" ? "full" : "redacted";

  const branding = await getBranding();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const sheets: Sheet<Record<string, unknown>>[] = [];

  // A cover sheet, because a bare stack of table dumps tells the person who
  // opens it in six months nothing about what they are holding.
  sheets.push({
    name: "About this file",
    columns: [
      { header: "Field", key: "field", type: "text", width: 26 },
      { header: "Value", key: "value", type: "text", width: 96 },
    ],
    rows: [
      { field: "Pharmacy", value: branding.name },
      { field: "Exported", value: format(new Date(), "dd MMM yyyy, HH:mm") },
      { field: "Exported by", value: session.user.name ?? session.user.email ?? "Owner" },
      {
        field: "Personal data",
        value:
          mode === "full"
            ? "INCLUDED — patient names, phone numbers and addresses are in this file."
            : "Redacted — patient and customer identifying details are shown as [redacted].",
      },
      { field: "Credentials", value: "Never exported. Passwords, PINs and MFA secrets are not in this file." },
      {
        field: "This is not a backup",
        value:
          "This file cannot be restored into the system. It is a readable copy for reference. " +
          "Use Settings -> Backup for a restorable, encrypted backup.",
      },
      {
        field: "Handling",
        value:
          "This file is not encrypted. Anyone who opens it can read it. Store it accordingly.",
      },
    ],
  });

  let totalRows = 0;
  for (const table of BACKUP_TABLES) {
    const rows = await readTable(table, tenantId);
    totalRows += rows.length;

    // Column order follows the first row; an empty table still gets a sheet
    // so its absence is visible rather than ambiguous.
    const columns = rows.length > 0 ? Object.keys(rows[0]) : ["(no rows)"];

    sheets.push({
      name: table,
      columns: columns.map((c) => ({
        header: c,
        key: (row: Record<string, unknown>) =>
          cellValue(redactValue(table, c, row[c], mode)),
        type: "text" as const,
      })),
      rows,
    });
  }

  const buffer = await buildWorkbook(sheets, {
    title: "Pharmacy data",
    pharmacy: branding.name,
  });

  await writeAuditLog({
    tenantId,
    userId: session.user.id,
    action: "data.workbookExport",
    entity: "Tenant",
    entityId: tenantId,
    after: {
      // Downloading every customer and patient record is worth a line in
      // the log whether or not it was redacted.
      personalData: mode === "full" ? "included" : "redacted",
      tables: BACKUP_TABLES.length,
      rows: totalRows,
    },
  });

  const stamp = format(new Date(), "yyyy-MM-dd");
  return new NextResponse(new Uint8Array(buffer), {
    headers: workbookHeaders(
      `${tenant.pharmacyName.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-data-${stamp}.xlsx`
    ),
  });
}
