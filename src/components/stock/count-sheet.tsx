"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  saveStockCountProgress,
  postStockCount,
  cancelStockCount,
} from "@/lib/actions/stock-counts";
import { AlertTriangle, CheckCircle2, Loader2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Line = {
  id: string;
  itemName: string;
  unit: string;
  batchNo: string;
  expiryDate: string;
  expectedQty: number;
  countedQty: number | null;
  currentQty: number;
  unitCost: number;
};

type Count = {
  id: string;
  countNo: string;
  status: string;
  note: string | null;
  branchName: string;
  startedAt: string;
  startedByName: string;
  completedAt: string | null;
  completedByName: string | null;
  lines: Line[];
};

export function CountSheet({ count }: { count: Count }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [postNote, setPostNote] = useState("");
  const [entered, setEntered] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      count.lines.map((l) => [l.id, l.countedQty === null ? "" : String(l.countedQty)])
    )
  );
  const [onlyDiffs, setOnlyDiffs] = useState(false);

  const open = count.status === "in_progress";

  const stats = useMemo(() => {
    let counted = 0;
    let variance = 0;
    let shortLines = 0;
    let overLines = 0;
    for (const l of count.lines) {
      const raw = entered[l.id];
      if (raw === "" || raw === undefined) continue;
      counted++;
      const diff = Number(raw) - l.expectedQty;
      if (diff < 0) shortLines++;
      if (diff > 0) overLines++;
      variance += diff * l.unitCost;
    }
    return { counted, variance, shortLines, overLines };
  }, [entered, count.lines]);

  // Stock that moved between opening the count and now — a sale during the
  // count, or somebody else adjusting the same batch.
  const drifted = count.lines.filter((l) => l.currentQty !== l.expectedQty);

  const visible = onlyDiffs
    ? count.lines.filter((l) => {
        const raw = entered[l.id];
        return raw !== "" && raw !== undefined && Number(raw) !== l.expectedQty;
      })
    : count.lines;

  function save() {
    const counts = count.lines
      .filter((l) => entered[l.id] !== "" && entered[l.id] !== undefined)
      .map((l) => ({ lineId: l.id, countedQty: Number(entered[l.id]) }));
    startTransition(async () => {
      try {
        await saveStockCountProgress({ countId: count.id, counts });
        toast.success(`Saved ${counts.length} of ${count.lines.length}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function post() {
    startTransition(async () => {
      try {
        const counts = count.lines
          .filter((l) => entered[l.id] !== "" && entered[l.id] !== undefined)
          .map((l) => ({ lineId: l.id, countedQty: Number(entered[l.id]) }));
        await saveStockCountProgress({ countId: count.id, counts });
        const result = await postStockCount({ countId: count.id, note: postNote || undefined });
        toast.success(
          result.corrections === 0
            ? "Count posted — stock matched exactly"
            : `Posted: ${result.corrections} batch${result.corrections === 1 ? "" : "es"} corrected · shrinkage ₹${Math.abs(result.discrepancyValue).toFixed(2)} ${result.discrepancyValue < 0 ? "short" : "over"}`
        );
        router.push("/stock-counts");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not post the count");
      }
    });
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            {count.countNo}
            <Badge
              variant={open ? "outline" : count.status === "completed" ? "secondary" : "destructive"}
              className="ml-2"
            >
              {count.status.replace("_", " ")}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {count.branchName} · opened {format(new Date(count.startedAt), "dd MMM yyyy, HH:mm")} by{" "}
            {count.startedByName}
            {count.completedAt &&
              ` · posted ${format(new Date(count.completedAt), "dd MMM yyyy, HH:mm")} by ${count.completedByName}`}
          </p>
        </div>
        {open && (
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => {
              startTransition(async () => {
                await cancelStockCount(count.id).catch(() => {});
                router.push("/stock-counts");
                router.refresh();
              });
            }}>
              <X className="h-4 w-4" /> Cancel count
            </Button>
            <Button variant="outline" disabled={pending} onClick={save}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save progress
            </Button>
          </div>
        )}
      </div>

      {drifted.length > 0 && open && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {drifted.length} batch{drifted.length === 1 ? "" : "es"} moved since this count opened
          </AlertTitle>
          <AlertDescription>
            Normal on a counter that keeps trading. Posting sets stock to what you counted,
            measured from where stock stands now — so those sales are not undone. The affected
            rows show both figures.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-3 text-sm">
        <div>
          <span className="text-muted-foreground">Counted </span>
          <span className="font-semibold tabular-nums">
            {stats.counted}/{count.lines.length}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Short </span>
          <span className="font-semibold tabular-nums text-destructive">{stats.shortLines}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Over </span>
          <span className="font-semibold tabular-nums text-success">{stats.overLines}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Shrinkage </span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              stats.variance < 0 && "text-destructive",
              stats.variance > 0 && "text-success"
            )}
          >
            {stats.variance === 0 ? "₹0.00" : `${stats.variance > 0 ? "+" : "−"}₹${Math.abs(stats.variance).toFixed(2)}`}
          </span>
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={onlyDiffs}
            onChange={(e) => setOnlyDiffs(e.target.checked)}
          />
          Only differences
        </label>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">System</TableHead>
              <TableHead className="w-28 text-right">Counted</TableHead>
              <TableHead className="text-right">Diff</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((l) => {
              const raw = entered[l.id];
              const has = raw !== "" && raw !== undefined;
              const diff = has ? Number(raw) - l.expectedQty : 0;
              const moved = l.currentQty !== l.expectedQty;
              return (
                <TableRow key={l.id}>
                  <TableCell>{l.itemName}</TableCell>
                  <TableCell className="font-mono text-xs">{l.batchNo}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(l.expiryDate), "MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.expectedQty}
                    {moved && (
                      <div className="text-[11px] text-warning-foreground">now {l.currentQty}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="text-right"
                      disabled={!open}
                      value={raw ?? ""}
                      onChange={(e) => setEntered((s) => ({ ...s, [l.id]: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      has && diff < 0 && "text-destructive",
                      has && diff > 0 && "text-success"
                    )}
                  >
                    {has ? (diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${diff}`) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {has && diff !== 0 ? `₹${Math.abs(diff * l.unitCost).toFixed(2)}` : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {open && (
        <div className="max-w-2xl space-y-3 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Textarea
              rows={2}
              placeholder="Note — what explains the variance?"
              value={postNote}
              onChange={(e) => setPostNote(e.target.value)}
            />
          </div>
          <Button
            disabled={pending || stats.counted < count.lines.length}
            onClick={post}
            title={
              stats.counted < count.lines.length
                ? "Every line needs a figure — a blank is not the same as zero"
                : undefined
            }
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Post count and correct stock
          </Button>
          {stats.counted < count.lines.length && (
            <p className="text-[11px] text-muted-foreground">
              {count.lines.length - stats.counted} line
              {count.lines.length - stats.counted === 1 ? "" : "s"} still blank. A blank is not
              the same as a zero, so posting is blocked until each is entered.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
