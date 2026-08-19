"use client";

import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMPORT_FIELDS, type ImportFieldKey } from "@/lib/import/fields";
import { mapRows, type ColumnMapping } from "@/lib/import/normalize";
import { validateRows, type ValidationSummary } from "@/lib/import/validate";
import { commitImport } from "@/lib/actions/import";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

type Step = "upload" | "map" | "preview" | "done";

function guessColumn(headers: string[], key: ImportFieldKey, label: string) {
  const needle = [key, label].map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return headers.find((h) => {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    return needle.includes(norm);
  });
}

export function ImportPanel() {
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileName, setFileName] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof commitImport>> | null>(null);

  const summary: ValidationSummary | null = useMemo(() => {
    if (step !== "preview" && step !== "done") return null;
    const normalized = mapRows(rawRows, mapping);
    return validateRows(normalized);
  }, [step, rawRows, mapping]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const cols = results.meta.fields ?? [];
        setHeaders(cols);
        setRawRows(results.data);

        const autoMapping: ColumnMapping = {};
        for (const field of IMPORT_FIELDS) {
          const guess = guessColumn(cols, field.key, field.label);
          if (guess) autoMapping[field.key] = guess;
        }
        setMapping(autoMapping);
        setStep("map");
      },
      error: (err) => toast.error(`Could not parse CSV: ${err.message}`),
    });
  }

  function commit() {
    if (!summary) return;
    const normalized = mapRows(rawRows, mapping);
    startTransition(async () => {
      try {
        const res = await commitImport(normalized);
        setResult(res);
        setStep("done");
        toast.success("Import complete");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setFileName("");
    setResult(null);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Import item master (CSV)</h2>
        <p className="text-sm text-muted-foreground">
          Upload a CSV of items (and optionally batches). You&apos;ll map columns to fields and
          preview validation errors before anything is saved.
        </p>
      </div>

      {step === "upload" && (
        <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/30">
          <UploadCloud className="h-6 w-6" />
          Click to choose a .csv file
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </label>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {fileName} · {rawRows.length} row{rawRows.length === 1 ? "" : "s"} detected
          </p>
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
            {IMPORT_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center justify-between gap-2">
                <Label className="text-xs">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                  {field.group === "batch" && (
                    <Badge variant="outline" className="ml-1 text-[9px]">
                      batch
                    </Badge>
                  )}
                </Label>
                <Select
                  value={mapping[field.key] ?? "__skip"}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [field.key]: v === "__skip" ? undefined : v }))
                  }
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip">— Don&apos;t import —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setStep("preview")} disabled={!mapping.name}>
              Continue to preview
            </Button>
            <Button variant="outline" onClick={reset}>
              Start over
            </Button>
          </div>
          {!mapping.name && (
            <p className="text-xs text-destructive">Map a column to Item name to continue.</p>
          )}
        </div>
      )}

      {step === "preview" && summary && (
        <div className="space-y-3">
          <div className="flex gap-2 text-sm">
            <Badge className="bg-success/15 text-success hover:bg-success/15">
              {summary.validCount} valid
            </Badge>
            {summary.invalidCount > 0 && (
              <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                {summary.invalidCount} with errors
              </Badge>
            )}
            <span className="text-muted-foreground">of {summary.total} rows</span>
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.slice(0, 200).map((row) => (
                  <TableRow key={row.rowIndex}>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.rowIndex + 1}
                    </TableCell>
                    <TableCell className="text-sm">{row.raw.name || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {row.hasBatch ? row.raw.batchNo || "—" : "—"}
                    </TableCell>
                    <TableCell>
                      {row.errors.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {row.errors.join("; ")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2">
            <Button onClick={commit} disabled={pending || summary.validCount === 0}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Import {summary.validCount} row{summary.validCount === 1 ? "" : "s"}
            </Button>
            <Button variant="outline" onClick={() => setStep("map")}>
              Back to mapping
            </Button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertDescription>
            Imported: {result.itemsCreated} new item{result.itemsCreated === 1 ? "" : "s"},{" "}
            {result.itemsUpdated} updated, {result.batchesCreated} batch
            {result.batchesCreated === 1 ? "" : "es"} added.
            {result.skipped > 0 && ` ${result.skipped} row(s) skipped due to errors.`}
          </AlertDescription>
        </Alert>
      )}
      {step === "done" && (
        <Button variant="outline" onClick={reset}>
          Import another file
        </Button>
      )}
    </div>
  );
}
