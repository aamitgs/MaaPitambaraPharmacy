import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { encryptBackup } from "@/lib/backup-crypto";
import { gatherTenantData, serializeBackup } from "@/lib/backup-payload";
import { recordError } from "@/lib/error-log";

/**
 * The nightly backup, hit by an OS-level scheduler (see README) rather than
 * by a logged-in user — so the credential is a shared secret header, not a
 * session.
 *
 * It builds its payload with exactly the same code as the "Backup now"
 * button. That is the entire point: this route previously hand-listed
 * seven tables while the manual export covered forty-five, so the backup
 * that ran unattended every night — the one a pharmacy would actually
 * restore from — was missing suppliers, purchases, ledgers, payments,
 * stock movements and cash-ups, and recorded "success" while doing it.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "BACKUP_CRON_SECRET not configured" }, { status: 501 });
  }
  if (req.headers.get("x-backup-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const results: { tenantId: string; ok: boolean; rows?: number; error?: string }[] = [];

  for (const { id: tenantId } of tenants) {
    try {
      const data = await gatherTenantData(tenantId);
      const encrypted = encryptBackup(serializeBackup(data));

      const dir = process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), "backups");
      await mkdir(dir, { recursive: true });
      const filename = `pharmacy-backup-${tenantId}-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;
      await writeFile(path.join(dir, filename), encrypted);

      const rows = Object.values(data.counts).reduce((a, b) => a + b, 0);
      await prisma.backupLog.create({ data: { tenantId, destination: "local", status: "success" } });
      results.push({ tenantId, ok: true, rows });
    } catch (e) {
      // A nightly backup that fails silently is the same as no backup at
      // all, so the failure goes where the owner will see it rather than
      // only into a log file on a shop PC.
      await recordError({
        source: "route",
        context: "nightly backup",
        error: e,
        tenantId,
      });
      await prisma.backupLog.create({ data: { tenantId, destination: "local", status: "failed" } });
      results.push({
        tenantId,
        ok: false,
        error: e instanceof Error ? e.message : "Backup failed",
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ results }, { status: allOk ? 200 : 500 });
}
