"use client";

import { useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inspectBackup, restoreBackup, getLiveRowCounts, type BackupInspection } from "@/lib/actions/backup";
import { AlertTriangle, DatabaseBackup, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  // Chunked: String.fromCharCode(...bytes) blows the call stack on a
  // multi-megabyte backup.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function RestorePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [base64, setBase64] = useState<string | null>(null);
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [live, setLive] = useState<Record<string, number> | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [confirmation, setConfirmation] = useState("");

  function pick(file: File) {
    startTransition(async () => {
      try {
        const b64 = await fileToBase64(file);
        // Inspect before anything else: the owner sees exactly what the
        // file holds, next to what they have now, before deciding.
        const [found, current] = await Promise.all([inspectBackup(b64), getLiveRowCounts()]);
        setBase64(b64);
        setInspection(found);
        setLive(current);
      } catch (e) {
        setBase64(null);
        setInspection(null);
        toast.error(e instanceof Error ? e.message : "Could not read that backup");
      }
    });
  }

  function run() {
    if (!base64) return;
    startTransition(async () => {
      try {
        const result = await restoreBackup(base64, mode, confirmation);
        toast.success(`Restored ${result.totalRows.toLocaleString()} rows`);
        window.location.reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    });
  }

  const rows = inspection
    ? Object.entries(inspection.counts)
        .filter(([, n]) => n > 0 || (live?.[Object.keys(inspection.counts)[0]] ?? 0) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium">Restore from a backup</h2>
        <p className="text-sm text-muted-foreground">
          Reads an encrypted backup file and writes it back. Owner only. The file is inspected
          first — nothing is written until you have seen what it contains.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".enc"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) pick(file);
          e.target.value = "";
        }}
      />
      <Button variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Choose a backup file
      </Button>

      {inspection && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="text-sm">
            <div className="font-medium">{inspection.pharmacyName}</div>
            <div className="text-xs text-muted-foreground">
              Taken {format(new Date(inspection.exportedAt), "dd MMM yyyy, HH:mm")} ·{" "}
              {inspection.totalRows.toLocaleString()} rows
            </div>
          </div>

          {!inspection.sameTenant && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Different pharmacy</AlertTitle>
              <AlertDescription>
                This file was taken from another pharmacy&apos;s database. It cannot be restored
                here.
              </AlertDescription>
            </Alert>
          )}

          <div className="max-h-56 overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Table</th>
                  <th className="px-2 py-1.5 text-right font-medium">In file</th>
                  <th className="px-2 py-1.5 text-right font-medium">Now</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([table, count]) => {
                  const now = live?.[table] ?? 0;
                  return (
                    <tr key={table} className="border-t">
                      <td className="px-2 py-1">{table}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{count}</td>
                      <td
                        className={cn(
                          "px-2 py-1 text-right tabular-nums",
                          now > count && "font-medium text-destructive"
                        )}
                      >
                        {now}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {inspection.sameTenant && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mode">Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as "replace" | "merge")}>
                  <SelectTrigger id="mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace">
                      Replace — delete everything, then restore the file
                    </SelectItem>
                    <SelectItem value="merge">
                      Merge — add only rows that are missing
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {mode === "replace"
                    ? "Anything recorded since this backup was taken is lost. Take a fresh backup first if the current data still matters."
                    : "Existing rows are left exactly as they are. Use this to recover records that were deleted by mistake."}
                </p>
              </div>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {mode === "replace" ? "This deletes your current data" : "This writes to the live database"}
                </AlertTitle>
                <AlertDescription>
                  {mode === "replace"
                    ? `Every row in this pharmacy is deleted and replaced by the ${inspection.totalRows.toLocaleString()} rows in this file. It cannot be undone.`
                    : "Rows present in the file but missing here are inserted. Existing rows are untouched."}
                </AlertDescription>
              </Alert>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">
                  Type <span className="font-mono font-semibold">RESTORE</span> to confirm
                </Label>
                <Input
                  id="confirm"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="RESTORE"
                  autoComplete="off"
                />
              </div>

              <Button
                variant="destructive"
                disabled={pending || confirmation !== "RESTORE"}
                onClick={run}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <DatabaseBackup className="h-4 w-4" />
                )}
                Restore this backup
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
