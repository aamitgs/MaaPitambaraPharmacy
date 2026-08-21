"use client";

import { useState, useTransition } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { createManualBackup } from "@/lib/actions/backup";
import { RestorePanel } from "./restore-panel";
import { DataWorkbookPanel } from "./data-workbook-panel";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, DownloadCloud, Loader2 } from "lucide-react";

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/octet-stream" });
}

export function BackupPanel({
  lastBackupAt,
  lastBackupStatus,
  isStale,
  canRestore,
}: {
  lastBackupAt: Date | null;
  lastBackupStatus: string | null;
  isStale: boolean;
  /** Restore is owner-only — a pharmacist may back up but not overwrite. */
  canRestore: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState({ lastBackupAt, lastBackupStatus, isStale });

  function runBackup() {
    startTransition(async () => {
      try {
        const result = await createManualBackup();
        const blob = base64ToBlob(result.base64);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus({ lastBackupAt: new Date(), lastBackupStatus: "success", isStale: false });
        toast.success(`Backup downloaded — ${result.totalRows.toLocaleString()} rows`);
      } catch (e) {
        setStatus((s) => ({ ...s, lastBackupStatus: "failed" }));
        toast.error(e instanceof Error ? e.message : "Backup failed");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Local backup</h2>
        <p className="text-sm text-muted-foreground">
          Exports everything this pharmacy owns — stock, sales, purchases, returns, ledgers,
          registers, staff and settings — as an AES-256 encrypted file that downloads to this
          device. Keep the file and your <code>BACKUP_ENCRYPTION_KEY</code> together somewhere
          safe: both are needed to restore.
        </p>
      </div>

      {status.isStale && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backup overdue</AlertTitle>
          <AlertDescription>
            {status.lastBackupAt
              ? `Last backup was ${formatDistanceToNow(status.lastBackupAt)} ago. `
              : "No backup has been taken yet. "}
            Run one now to stay covered.
          </AlertDescription>
        </Alert>
      )}
      {!status.isStale && status.lastBackupAt && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertDescription>
            Last backup {format(status.lastBackupAt, "dd MMM yyyy, HH:mm")} (
            {status.lastBackupStatus})
          </AlertDescription>
        </Alert>
      )}

      <Button onClick={runBackup} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
        Backup now
      </Button>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Scheduled backups (self-hosted)</p>
        <p className="mt-1">
          For an automatic daily backup, point an OS-level cron (or your container
          orchestrator&apos;s scheduler) at{" "}
          <code>POST /api/backup/scheduled</code> with header{" "}
          <code>x-backup-secret: $BACKUP_CRON_SECRET</code>. It writes an encrypted file to the{" "}
          <code>backups/</code> volume and logs the attempt here, the same as a manual run. See
          the README for a sample crontab entry.
        </p>
      </div>

      {canRestore && (
        <>
          <Separator />
          <RestorePanel />
          <Separator />
          <DataWorkbookPanel />
        </>
      )}
    </div>
  );
}
