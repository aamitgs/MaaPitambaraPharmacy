"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLicenseExpiryWindow } from "@/lib/actions/branch-settings";
import { ArrowRight } from "lucide-react";

export function CompliancePanel({ initial }: { initial: { licenseExpiryWindowDays: number } }) {
  const [windowDays, setWindowDays] = useState(String(initial.licenseExpiryWindowDays));
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await updateLicenseExpiryWindow({ licenseExpiryWindowDays: Number(windowDays) || 60 });
        toast.success("Saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save changes");
      }
    });
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-sm font-medium">License renewal warning window</h2>
        <p className="text-sm text-muted-foreground">
          Licenses expiring within this many days appear on Alerts and the dashboard. Applies across all
          branches.
        </p>
      </div>

      <div className="space-y-1.5 max-w-xs">
        <Label htmlFor="expiryWindow">Days</Label>
        <Input
          id="expiryWindow"
          type="number"
          min={1}
          value={windowDays}
          onChange={(e) => setWindowDays(e.target.value)}
        />
      </div>

      <Button disabled={pending} onClick={submit}>
        Save
      </Button>

      <div className="border-t pt-4">
        <Link href="/branches" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Manage branch license numbers &amp; expiry dates <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
