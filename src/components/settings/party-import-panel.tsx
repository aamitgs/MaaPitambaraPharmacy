"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readTabularFile } from "@/lib/import/read-file";
import {
  fieldsFor,
  validatePartyRows,
  type PartyFieldKey,
  type PartyKind,
  type PartyRow,
} from "@/lib/import/party-fields";
import { commitPartyImport, getExistingPartyNames } from "@/lib/actions/party-import";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same guess-the-column heuristic the item import uses. */
function guessColumn(headers: string[], key: string, label: string): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const targets = [norm(key), norm(label)];
  return headers.find((h) => targets.includes(norm(h)));
}

export function PartyImportPanel({ kind }: { kind: PartyKind }) {
  const fields = fieldsFor(kind);
  const noun = kind === "supplier" ? "suppliers" : "customers";

  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<PartyFieldKey, string>>>({});
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(
    null
  );

  const mapped: PartyRow[] = useMemo(
    () =>
      rawRows.map((row) => {
        const out: PartyRow = {};
        for (const f of fields) {
          const col = mapping[f.key];
          if (col) out[f.key] = row[col] ?? "";
        }
        return out;
      }),
    [rawRows, mapping, fields]
  );

  const validated = useMemo(
    () => (step === "map" ? validatePartyRows(kind, mapped, existing) : []),
    [step, kind, mapped, existing]
  );
  const badRows = validated.filter((r) => r.errors.length > 0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const [{ headers: cols, rows }, names] = await Promise.all([
        readTabularFile(file),
        getExistingPartyNames(kind),
      ]);
      if (rows.length === 0) {
        toast.error("That file has a header but no rows.");
        return;
      }
      setHeaders(cols);
      setRawRows(rows);
      setExisting(new Set(names));
      const auto: Partial<Record<PartyFieldKey, string>> = {};
      for (const f of fields) {
        const guess = guessColumn(cols, f.key, f.label);
        if (guess) auto[f.key] = guess;
      }
      setMapping(auto);
      setStep("map");
    } catch (err) {
      toast.error(err instanceof Error ? `Could not read that file: ${err.message}` : "Failed");
    }
  }

  function commit() {
    startTransition(async () => {
      try {
        const res = await commitPartyImport(kind, mapped);
        setResult(res);
        setStep("done");
        toast.success(`${res.created} created, ${res.updated} updated`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  if (step === "done" && result) {
    return (
      <div className="max-w-3xl space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/5 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div className="text-sm">
            <div className="font-medium">Import finished</div>
            <p className="text-xs text-muted-foreground">
              {result.created} created, {result.updated} updated
              {result.skipped > 0 && `, ${result.skipped} skipped because of errors`}.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setStep("upload");
            setResult(null);
            setRawRows([]);
          }}
        >
          Import another file
        </Button>
      </div>
    );
  }

  if (step === "upload") {
    return (
      <div className="max-w-3xl space-y-3">
        <div>
          <h2 className="text-sm font-medium capitalize">Import {noun}</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel file. Rows are matched on name — a {kind} already on file is
            updated rather than duplicated, so running the same file twice is safe.
          </p>
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground hover:bg-muted/40">
          <Upload className="h-5 w-5" />
          Click to choose a .csv or .xlsx file
          <input
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFile}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">
          Map columns <span className="text-muted-foreground">· {fileName}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {rawRows.length} row{rawRows.length === 1 ? "" : "s"} found.
          {badRows.length > 0 && ` ${badRows.length} will be skipped.`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-xs font-medium">
              {f.label}
              {f.required && <span className="ml-1 text-destructive">*</span>}
            </label>
            <select
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={mapping[f.key] ?? ""}
              onChange={(e) =>
                setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))
              }
            >
              <option value="">— not in this file —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Action</TableHead>
              {fields.map((f) => (
                <TableHead key={f.key}>{f.label}</TableHead>
              ))}
              <TableHead>Problems</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {validated.slice(0, 12).map((r, i) => (
              <TableRow key={i} className={cn(r.errors.length > 0 && "bg-destructive/5")}>
                <TableCell>
                  <Badge variant={r.action === "update" ? "secondary" : "outline"}>
                    {r.errors.length > 0 ? "skip" : r.action}
                  </Badge>
                </TableCell>
                {fields.map((f) => (
                  <TableCell key={f.key} className="text-xs">
                    {r.raw[f.key] || "—"}
                  </TableCell>
                ))}
                <TableCell className="text-xs text-destructive">
                  {r.errors.join("; ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {validated.length > 12 && (
          <p className="border-t p-2 text-center text-xs text-muted-foreground">
            Showing the first 12 of {validated.length}.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setStep("upload")}>
          Choose a different file
        </Button>
        <Button
          onClick={commit}
          disabled={pending || validated.length === badRows.length}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Import {validated.length - badRows.length} {noun}
        </Button>
      </div>
    </div>
  );
}
