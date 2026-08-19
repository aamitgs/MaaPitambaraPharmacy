"use client";

import { useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { startMfaSetup, confirmMfaSetup } from "@/lib/actions/mfa";
import { CheckCircle2, AlertCircle } from "lucide-react";

export function MfaSetupForm({ onDone }: { onDone?: () => void }) {
  const { update } = useSession();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [alreadyEnabled, setAlreadyEnabled] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void startMfaSetup().then((res) => {
      if (res.alreadyEnabled) {
        setAlreadyEnabled(true);
      } else {
        setQrDataUrl(res.qrDataUrl);
        setSecret(res.secret);
      }
    });
  }, []);

  function submit(value: string) {
    setError(null);
    startTransition(async () => {
      const res = await confirmMfaSetup(value);
      if (!res.ok) {
        setError(res.error);
        setCode("");
        return;
      }
      setSuccess(true);
      await update({ trigger: "update" } as never);
      setTimeout(() => {
        if (onDone) onDone();
        // Full reload, not router.push: the session cookie just changed
        // (mfaSetupRequired flipped) and a client-side navigation can race
        // ahead of that on a stale RSC cache — see login-form.tsx for the
        // same pattern and the bug this avoids.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        else window.location.assign("/dashboard");
      }, 900);
    });
  }

  if (alreadyEnabled) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4 text-success" />
        <AlertDescription>MFA is already enabled on this account.</AlertDescription>
      </Alert>
    );
  }

  if (success) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4 text-success" />
        <AlertDescription>MFA enabled. Redirecting…</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password),
        then enter the 6-digit code it shows to confirm.
      </p>
      {qrDataUrl ? (
        <div className="flex justify-center rounded-lg border bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="MFA QR code" width={200} height={200} />
        </div>
      ) : (
        <Skeleton className="mx-auto h-[200px] w-[200px]" />
      )}
      {secret && (
        <p className="text-center text-xs text-muted-foreground">
          Can&apos;t scan? Enter manually: <code className="font-mono">{secret}</code>
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <InputOTP
          maxLength={6}
          value={code}
          autoFocus
          disabled={pending}
          onChange={(value) => {
            setCode(value);
            if (value.length === 6) submit(value);
          }}
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }).map((_, i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          disabled={code.length !== 6 || pending}
          onClick={() => submit(code)}
          className="w-full"
        >
          Confirm & enable MFA
        </Button>
      </div>
    </div>
  );
}
