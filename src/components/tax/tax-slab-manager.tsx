"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTaxSlab,
  addTaxSlabRate,
  setHsnMapping,
  removeHsnMapping,
  deleteScheduledTaxRate,
  type TaxSlabSummary,
} from "@/lib/actions/tax-slabs";
import { CalendarClock, Loader2, Plus, Tag, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function TaxSlabManager({ slabs }: { slabs: TaxSlabSummary[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newSlab, setNewSlab] = useState(false);
  const [rateFor, setRateFor] = useState<TaxSlabSummary | null>(null);
  const [mapFor, setMapFor] = useState<TaxSlabSummary | null>(null);

  const [slabName, setSlabName] = useState("");
  const [slabDesc, setSlabDesc] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [rateNote, setRateNote] = useState("");
  const [hsn, setHsn] = useState("");

  const run = (fn: () => Promise<unknown>, ok: string, done?: () => void) =>
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        done?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">GST slabs</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            A slab is a bucket an item belongs to; the rate under it is what changes. When GST
            rates move, add a dated rate here and every item on the slab follows — no re-tagging,
            and past bills keep the rate they were charged at.
          </p>
        </div>
        <Button onClick={() => setNewSlab(true)}>
          <Plus className="h-4 w-4" /> New slab
        </Button>
      </div>

      {slabs.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium">No slabs yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Until one exists, every item bills at the rate typed on it. A typical Indian pharmacy
            needs three: Nil-rated for life-saving medicines, 5% for most finished medicines, and
            18% for industrial formulations and many devices.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {slabs.map((s) => (
          <div key={s.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  {s.currentRate === null ? (
                    <Badge variant="destructive">No rate in force</Badge>
                  ) : (
                    <Badge variant="secondary" className="tabular-nums">
                      {s.currentRate}%
                    </Badge>
                  )}
                  {s.upcoming && (
                    <Badge variant="outline" className="gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {s.upcoming.rate}% from{" "}
                      {format(new Date(s.upcoming.effectiveFrom), "dd MMM yyyy")}
                    </Badge>
                  )}
                </div>
                {s.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.itemCount} item{s.itemCount === 1 ? "" : "s"} assigned directly
                  {s.hsnCodes.length > 0 && ` · HSN ${s.hsnCodes.join(", ")}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setMapFor(s)}>
                  <Tag className="h-4 w-4" /> Map HSN
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRateFor(s)}>
                  <Plus className="h-4 w-4" /> Add rate
                </Button>
              </div>
            </div>

            {s.rates.length > 0 && (
              <>
                <Separator className="my-3" />
                <div className="space-y-1">
                  {s.rates.map((r) => {
                    const started = new Date(r.effectiveFrom) <= new Date();
                    const isCurrent = started && r.rate === s.currentRate;
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "flex items-center gap-3 text-xs",
                          !started && "text-muted-foreground"
                        )}
                      >
                        <span className="w-14 font-medium tabular-nums">{r.rate}%</span>
                        <span className="w-32">
                          from {format(new Date(r.effectiveFrom), "dd MMM yyyy")}
                        </span>
                        {isCurrent && <Badge variant="secondary">in force</Badge>}
                        {!started && <Badge variant="outline">scheduled</Badge>}
                        {r.note && <span className="text-muted-foreground">{r.note}</span>}
                        {/* Only a rate that has never applied can be removed —
                            see deleteScheduledTaxRate. */}
                        {!started && (
                          <button
                            type="button"
                            aria-label={`Remove the scheduled ${r.rate}% rate`}
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => deleteScheduledTaxRate(r.id),
                                "Scheduled rate removed"
                              )
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {s.hsnCodes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.hsnCodes.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {code}
                    <button
                      type="button"
                      aria-label={`Unmap HSN ${code}`}
                      disabled={pending}
                      onClick={() => run(() => removeHsnMapping(code), `HSN ${code} unmapped`)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New slab */}
      <Dialog open={newSlab} onOpenChange={setNewSlab}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New GST slab</DialogTitle>
            <DialogDescription>
              Name it for what it contains, not for its rate — &ldquo;Standard medicines&rdquo;
              survives a rate change, &ldquo;12%&rdquo; does not.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="slab-name">Name</Label>
              <Input
                id="slab-name"
                value={slabName}
                onChange={(e) => setSlabName(e.target.value)}
                placeholder="e.g. Standard medicines"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slab-desc">Description</Label>
              <Input
                id="slab-desc"
                value={slabDesc}
                onChange={(e) => setSlabDesc(e.target.value)}
                placeholder="What belongs in here"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewSlab(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !slabName.trim()}
              onClick={() =>
                run(
                  () => createTaxSlab({ name: slabName, description: slabDesc || undefined, sortOrder: slabs.length }),
                  "Slab created — now add a rate",
                  () => {
                    setNewSlab(false);
                    setSlabName("");
                    setSlabDesc("");
                  }
                )
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add rate */}
      <Dialog open={Boolean(rateFor)} onOpenChange={(o) => !o && setRateFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a rate to {rateFor?.name}</DialogTitle>
            <DialogDescription>
              Applies from the date you pick. Earlier rates stay on record — that is what lets a
              past invoice be explained rather than contradicted.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rate">Rate (%)</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eff">Effective from</Label>
              <Input
                id="eff"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate-note">Note</Label>
            <Input
              id="rate-note"
              value={rateNote}
              onChange={(e) => setRateNote(e.target.value)}
              placeholder="e.g. GST 2.0 notification"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRateFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || rate === ""}
              onClick={() =>
                run(
                  () =>
                    addTaxSlabRate({
                      slabId: rateFor!.id,
                      rate: Number(rate),
                      effectiveFrom,
                      note: rateNote || undefined,
                    }),
                  "Rate added",
                  () => {
                    setRateFor(null);
                    setRate("");
                    setRateNote("");
                  }
                )
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Map HSN */}
      <Dialog open={Boolean(mapFor)} onOpenChange={(o) => !o && setMapFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Map an HSN code to {mapFor?.name}</DialogTitle>
            <DialogDescription>
              Every item with this HSN picks up the slab automatically, unless it has one of its
              own. In Indian GST the HSN is the classification, so this is the tier that does
              most of the work.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="hsn">HSN code</Label>
            <Input
              id="hsn"
              value={hsn}
              onChange={(e) => setHsn(e.target.value)}
              placeholder="e.g. 3004"
            />
            <p className="text-[11px] text-muted-foreground">
              3003 and 3004 are medicaments; 3005 dressings; 3006 pharmaceutical goods; 9018
              medical instruments.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMapFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || hsn.trim().length < 2}
              onClick={() =>
                run(
                  () => setHsnMapping({ hsnCode: hsn.trim(), slabId: mapFor!.id }),
                  `HSN ${hsn.trim()} mapped to ${mapFor!.name}`,
                  () => {
                    setMapFor(null);
                    setHsn("");
                  }
                )
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
