"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { MonitorCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  revokeTrustedDevice,
  revokeAllTrustedDevices,
  type TrustedDeviceRow,
} from "@/lib/actions/trusted-device";
import { TRUST_DAYS } from "@/lib/trusted-device";

/**
 * The devices currently allowed to skip the one-time code.
 *
 * Shown even when empty: "no device is skipping the code" is the reassuring
 * answer, and a panel that vanishes when the list is empty leaves the owner
 * unable to confirm it.
 */
export function TrustedDevicesPanel({ devices }: { devices: TrustedDeviceRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function revokeOne(d: TrustedDeviceRow) {
    setBusy(d.id);
    startTransition(async () => {
      try {
        await revokeTrustedDevice(d.id);
        toast.success(`${d.label} will be asked for a code again`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not revoke");
      } finally {
        setBusy(null);
      }
    });
  }

  function revokeAll() {
    startTransition(async () => {
      try {
        const { revoked } = await revokeAllTrustedDevices();
        toast.success(
          revoked === 1 ? "1 device will be asked for a code again"
                        : `${revoked} devices will be asked for a code again`
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not revoke");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <MonitorCheck className="h-4 w-4" /> Devices that skip the code
          </h2>
          <p className="max-w-prose text-xs text-muted-foreground">
            Signing in on one of these asks only for the password for {TRUST_DAYS} days.
            Your password is always still required. Trust is dropped automatically when
            the password changes or the authenticator is reset.
          </p>
        </div>
        {devices.length > 0 && (
          <Button size="sm" variant="outline" onClick={revokeAll} disabled={pending}>
            <ShieldOff /> Ask everywhere
          </Button>
        )}
      </div>

      {devices.length === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          No device is skipping the code. Every sign-in asks for the authenticator.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{d.label}</span>
                  {d.isThisDevice && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      this device
                    </Badge>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {d.ip ? `${d.ip} · ` : ""}
                  last used {formatDistanceToNow(new Date(d.lastUsedAt), { addSuffix: true })}
                  {" · "}
                  {d.daysLeft === 0
                    ? "expires today"
                    : `${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} left`}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => revokeOne(d)}
                disabled={pending && busy === d.id}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
