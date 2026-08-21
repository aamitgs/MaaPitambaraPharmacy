import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { encryptBackup } from "@/lib/backup-crypto";
import { gatherTenantData, serializeBackup } from "@/lib/backup-payload";
import { recordError } from "@/lib/error-log";
import { usingObjectStore, putObject } from "@/lib/object-store";

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
 *
 * Two callers, two shapes. An OS-level scheduler on the shop machine POSTs
 * with an x-backup-secret header. A platform scheduler GETs and cannot set
 * custom headers, so it carries the platform's own CRON_SECRET as a bearer
 * token. Both are accepted; neither is optional.
 */
/**
 * Gathering forty-five tables, encrypting and uploading takes longer than a
 * request-shaped default allows, and a function killed mid-run leaves no log
 * line at all — the backup simply does not happen and nothing says so. Sixty
 * seconds is the ceiling on every plan tier, so this cannot fail a deploy
 * the way a higher number would.
 */
export const maxDuration = 60;

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak
  // the length, so compare that separately and always run the check.
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorised(req: NextRequest): { ok: boolean; configured: boolean } {
  const headerSecret = process.env.BACKUP_CRON_SECRET;
  const bearerSecret = process.env.CRON_SECRET;
  if (!headerSecret && !bearerSecret) return { ok: false, configured: false };

  const given = req.headers.get("x-backup-secret");
  if (headerSecret && given && equal(given, headerSecret)) return { ok: true, configured: true };

  const auth = req.headers.get("authorization");
  if (bearerSecret && auth?.startsWith("Bearer ")) {
    if (equal(auth.slice(7), bearerSecret)) return { ok: true, configured: true };
  }
  return { ok: false, configured: true };
}

async function runScheduledBackup(req: NextRequest) {
  const { ok, configured } = authorised(req);
  if (!configured) {
    return NextResponse.json(
      { error: "Neither BACKUP_CRON_SECRET nor CRON_SECRET is configured" },
      { status: 501 }
    );
  }
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const results: { tenantId: string; ok: boolean; rows?: number; error?: string }[] = [];

  for (const { id: tenantId } of tenants) {
    try {
      const data = await gatherTenantData(tenantId);
      const encrypted = encryptBackup(serializeBackup(data));

      const filename = `pharmacy-backup-${tenantId}-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;

      // Where this lands is not cosmetic. On a host with an ephemeral or
      // read-only filesystem a local write is discarded between requests,
      // and a backup that records "success" and is not there afterwards is
      // worse than no backup at all — nobody goes looking until they need
      // it. So the destination follows where durable storage actually is,
      // and is recorded as what it was.
      const destination = usingObjectStore() ? "object_store" : "local";
      if (destination === "object_store") {
        await putObject(`backups/${filename}`, encrypted, "application/octet-stream");
      } else {
        const dir = process.env.BACKUP_LOCAL_DIR || path.join(process.cwd(), "backups");
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), encrypted);
      }

      const rows = Object.values(data.counts).reduce((a, b) => a + b, 0);
      await prisma.backupLog.create({ data: { tenantId, destination, status: "success" } });
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
      await prisma.backupLog.create({
        data: { tenantId, destination: usingObjectStore() ? "object_store" : "local", status: "failed" },
      });
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

/** An OS-level scheduler on the shop machine. */
export const POST = runScheduledBackup;

/** A platform scheduler, which issues a GET. */
export const GET = runScheduledBackup;
