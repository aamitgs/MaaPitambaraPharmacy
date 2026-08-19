"use client";

import { MfaSetupForm } from "@/components/mfa-setup-form";

export function SecurityPanel({ totpEnabled }: { totpEnabled: boolean }) {
  return (
    <div className="max-w-md space-y-4">
      <div>
        <h2 className="text-sm font-medium">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          Owners and pharmacists are required to enable this. It&apos;s optional for counter
          staff, but recommended.
        </p>
      </div>
      <MfaSetupForm onDone={() => window.location.reload()} />
      {totpEnabled === false && (
        <p className="text-xs text-muted-foreground">
          Scan the QR code above with an authenticator app to turn this on.
        </p>
      )}
    </div>
  );
}
