"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { updateSellingSettings, type SellingSettings } from "@/lib/actions/tenant-settings";
import { Loader2, Palette, ShieldCheck } from "lucide-react";

export function SellingPanel({ initial }: { initial: SellingSettings }) {
  const [pending, startTransition] = useTransition();
  const [expiry, setExpiry] = useState(String(initial.nearExpiryWindowDays));
  const [wholesale, setWholesale] = useState(initial.wholesaleBillingEnabled);
  const [offlineHours, setOfflineHours] = useState(String(initial.offlineSyncMaxHours));

  function save() {
    startTransition(async () => {
      try {
        await updateSellingSettings({
          nearExpiryWindowDays: Number(expiry),
          wholesaleBillingEnabled: wholesale,
          offlineSyncMaxHours: Number(offlineHours),
        });
        toast.success("Settings saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Stock warnings</h2>
        <p className="text-xs text-muted-foreground">Changes are written to the audit log.</p>
      </div>

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="expiry">Near-expiry warning (days)</Label>
        <Input
          id="expiry"
          type="number"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Drives the alerts screen and blocks returns of stock this close to expiry.
        </p>
      </div>

      <Separator />

      <div>
        <h2 className="text-sm font-semibold">Offline billing</h2>
        <p className="text-xs text-muted-foreground">
          What happens to bills rung up while the line is down.
        </p>
      </div>

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="offlineHours">Post queued bills automatically for (hours)</Label>
        <Input
          id="offlineHours"
          type="number"
          min={1}
          max={168}
          value={offlineHours}
          onChange={(e) => setOfflineHours(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Past this, a queued bill is held rather than posted on its own — it would claim stock
          that has since moved, at prices that may have changed, and if it crosses a month it
          lands in the wrong GST return. Nothing is ever discarded: held bills wait in the queue
          with a &ldquo;post it anyway&rdquo; button.
        </p>
      </div>

      <Separator />

      <div>
        <h2 className="text-sm font-semibold">Wholesale billing</h2>
        <p className="text-xs text-muted-foreground">
          For a pharmacy that also supplies other shops.
        </p>
      </div>

      <label className="flex max-w-2xl items-start gap-2.5 rounded-lg border p-3">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={wholesale}
          onChange={(e) => setWholesale(e.target.checked)}
        />
        <div>
          <div className="text-sm font-medium">Bill at PTR as well as MRP</div>
          <p className="text-[11px] text-muted-foreground">
            Off by default, and while it is off nothing about PTR appears anywhere — a retail
            counter should not carry a distributor&apos;s vocabulary. Switching it on adds a PTR
            field when receiving stock, and a Retail/PTR choice at the till on batches that have
            one. Existing bills are unaffected: each records the price it was billed on.
          </p>
        </div>
      </label>

      <Button onClick={save} disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Save settings
      </Button>

      <Separator />

      {/* Both groups that used to live on this tab moved somewhere their
          neighbours make sense. A pointer beats leaving the owner hunting
          for a field that was here yesterday. */}
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-maroon" />
          <p className="text-muted-foreground">
            The staff discount cap, sales return window and manager PIN are under{" "}
            <Link href="/staff" className="font-medium text-foreground underline underline-offset-2">
              Staff &amp; roles → Counter limits
            </Link>
            . They decide what staff may do unsupervised, so changing them asks for your password
            and an authenticator code.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
          <Palette className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" />
          <p className="text-muted-foreground">
            The bill header, footer and terms are under{" "}
            <Link href="/branding" className="font-medium text-foreground underline underline-offset-2">
              Branding → Invoice
            </Link>
            , alongside the logo and colours — everything that appears on a bill in one place.
          </p>
        </div>
      </div>
    </div>
  );
}
