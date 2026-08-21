"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Eraser, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { previewRetention, runRetention } from "@/lib/actions/retention";
import { MINIMUM_RETENTION_YEARS } from "@/lib/retention";
import type { RetentionPreview } from "@/lib/actions/retention";

export function RetentionPanel() {
  const [years, setYears] = useState(String(MINIMUM_RETENTION_YEARS));
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function check() {
    startTransition(async () => {
      try {
        setPreview(await previewRetention(Number(years)));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not check");
      }
    });
  }

  function run() {
    startTransition(async () => {
      try {
        const r = await runRetention(Number(years));
        toast.success(
          r.count === 0
            ? "Nothing was old enough to clear."
            : `Patient details cleared from ${r.count} bill${r.count === 1 ? "" : "s"}.`
        );
        setConfirming(false);
        setPreview(await previewRetention(Number(years)));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not clear");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Patient details retention</h2>
        <p className="max-w-prose text-xs text-muted-foreground">
          Bills are kept forever — they have to be. What need not be kept forever is who bought the
          medicine. This clears the patient&apos;s name, age, phone, address and prescription
          image from bills older than the window below, leaving the bill, its lines, its totals
          and its tax completely intact.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="years">Keep patient details for (years)</Label>
          <Input
            id="years"
            type="number"
            min={MINIMUM_RETENTION_YEARS}
            value={years}
            onChange={(e) => {
              setYears(e.target.value);
              setPreview(null);
            }}
            className="w-28"
          />
        </div>
        <Button variant="outline" onClick={check} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Check what this affects
        </Button>
      </div>

      <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          The minimum is {MINIMUM_RETENTION_YEARS} years and cannot be lowered. Schedule H1
          dispensing records must be kept 3 years under Rule 65(11A) of the Drugs and Cosmetics
          Rules, and GST records 6 years under section 36 of the CGST Act — the longer of the two
          applies to everything.
        </span>
      </p>

      {preview && (
        <div className="rounded-lg border p-3 text-sm">
          {preview.blockedReason ? (
            <p className="text-destructive">{preview.blockedReason}</p>
          ) : preview.eligible === 0 ? (
            <p className="text-muted-foreground">
              Nothing is old enough to clear.
              {preview.oldestWithDetails &&
                ` The oldest bill carrying patient details is from ${format(
                  new Date(preview.oldestWithDetails),
                  "MMMM yyyy"
                )}.`}
            </p>
          ) : (
            <div className="space-y-2">
              <p>
                <strong>{preview.eligible}</strong> bill{preview.eligible === 1 ? "" : "s"} dated
                before{" "}
                <strong>
                  {preview.cutoff ? format(new Date(preview.cutoff), "d MMMM yyyy") : ""}
                </strong>{" "}
                carry patient details.
                {preview.withPrescription > 0 && (
                  <>
                    {" "}
                    {preview.withPrescription} of them {preview.withPrescription === 1 ? "has" : "have"} a
                    prescription image attached, which is cleared too.
                  </>
                )}
              </p>
              <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
                <Eraser /> Clear them
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear patient details from {preview?.eligible} bills?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Names, ages, phone numbers, addresses and prescription images are removed from
                  bills dated before{" "}
                  {preview?.cutoff ? format(new Date(preview.cutoff), "d MMMM yyyy") : ""}.
                </p>
                <p>
                  The bills themselves stay exactly as they are — every report, GST return and
                  ledger reads the same afterwards.
                </p>
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
                  This cannot be undone. Take a backup first if you want the details recoverable.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={run} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Clear patient details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
