"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { readTabularFile } from "@/lib/import/read-file";
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
import { autoMapColumns, deriveColumns, type DerivedColumn } from "@/lib/import/auto-map";
import { validateRows, type ValidationSummary } from "@/lib/import/validate";
import { commitImport } from "@/lib/actions/import";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

type Step = "upload" | "map" | "preview" | "done";

export function ImportPanel() {
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileName, setFileName] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof commitImport>> | null>(null);
  const [derived, setDerived] = useState<DerivedColumn[]>([]);
  const [mappedCount, setMappedCount] = useState(0);
  const [showBatchFields, setShowBatchFields] = useState(false);

  const itemFields = IMPORT_FIELDS.filter((f) => f.group === "item");
  const batchFields = IMPORT_FIELDS.filter((f) => f.group === "batch");
  const batchFieldsMapped = batchFields.filter((f) => mapping[f.key]).length;

  const summary: ValidationSummary | null = useMemo(() => {
    if (step !== "preview" && step !== "done") return null;
    const normalized = mapRows(rawRows, mapping);
    return validateRows(normalized);
  }, [step, rawRows, mapping]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const { headers: cols, rows } = await readTabularFile(file);
      if (rows.length === 0) {
        toast.error("That file has a header but no rows.");
        return;
      }
      // Build the columns the file implies but does not carry (a single
      // GST rate from its SGST/CGST halves; packs and loose units from a
      // "83.2" stock figure), then match everything by name.
      const { headers: withDerived, rows: withDerivedRows, derived: added, seed } = deriveColumns(cols, rows);
      setHeaders(withDerived);
      setRawRows(withDerivedRows);
      setDerived(added);

      const autoMapping = autoMapColumns(withDerived, { seed, sample: withDerivedRows.slice(0, 200) });
      setMapping(autoMapping);
      setMappedCount(Object.keys(autoMapping).length);
      // Open the batch section by default only when the file actually
      // matched something in it — otherwise it's just noise for a file
      // that only ever had item columns to begin with.
      setShowBatchFields(
        IMPORT_FIELDS.some((f) => f.group === "batch" && autoMapping[f.key])
      );
      setStep("map");
    } catch (err) {
      toast.error(
        err instanceof Error ? `Could not read that file: ${err.message}` : "Could not read that file"
      );
    }
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
    setShowBatchFields(false);
    setResult(null);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Import items &amp; stock</h2>
        <p className="text-sm text-muted-foreground">
          Upload a CSV or Excel file. Items alone, or items with their batches — batch number,
          expiry, MRP and quantity in the same row bring stock in with them. Columns are matched
          automatically; you can correct any of them before anything is saved.
        </p>
      </div>

      {step === "upload" && (
        <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/30">
          <UploadCloud className="h-6 w-6" />
          Click to choose a .csv or .xlsx file
          <input
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFile}
          />
        </label>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {fileName} · {rawRows.length} row{rawRows.length === 1 ? "" : "s"} detected ·{" "}
            <span className="font-medium text-foreground">
              {mappedCount} column{mappedCount === 1 ? "" : "s"} matched automatically
            </span>
            . Check them below and change anything that looks wrong.
          </p>
          {derived.length > 0 && (
            // A computed column must never be a surprise — say where it
            // came from, next to the mapping that uses it.
            <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              {derived.map((d) => (
                <p key={d.header}>
                  <span className="font-medium text-foreground">{d.header}</span> — {d.note}
                </p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
            {itemFields.map((field) => (
              <div key={field.key} className="flex items-center justify-between gap-2">
                <Label className="text-xs">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
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

          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setShowBatchFields((v) => !v)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium"
            >
              <span className="flex items-center gap-1.5">
                {showBatchFields ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                Batch &amp; stock columns
                <Badge variant="outline" className="text-[9px]">optional</Badge>
                {batchFieldsMapped > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    · {batchFieldsMapped} matched
                  </span>
                )}
              </span>
            </button>
            {!showBatchFields && (
              <p className="border-t px-3 pb-3 text-xs text-muted-foreground">
                Not in this file, and that&apos;s fine — this will import the item catalogue only.
                Add batch number, expiry and stock later through a GRN or Stock Count, or expand
                this to map them now if your file has them.
              </p>
            )}
            {showBatchFields && (
              <div className="grid grid-cols-2 gap-3 border-t p-3">
                {batchFields.map((field) => (
                  <div key={field.key} className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{field.label}</Label>
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
            )}
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
            {summary.warningCount > 0 && (
              <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
                {summary.warningCount} to check
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
                        row.warnings.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" /> OK
                          </span>
                        ) : (
                          // Imports either way — this is worth knowing, not
                          // worth refusing the row over.
                          <span className="inline-flex items-start gap-1 text-xs text-warning-foreground">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {row.warnings.join("; ")}
                          </span>
                        )
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

          {summary.warningCount > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
              {summary.warningCount === 1
                ? "1 row will import, but its composition cannot be matched, so that item will not be offered as a substitute."
                : `${summary.warningCount} rows will import, but their compositions cannot be matched, so those items will not be offered as substitutes.`}{" "}
              {summary.warningCount === 1 ? "You can fix it" : "You can fix them"} here or
              afterwards under{" "}
              <Link href="/items/composition" className="underline underline-offset-2">
                Items → Composition
              </Link>
              .
            </p>
          )}

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
