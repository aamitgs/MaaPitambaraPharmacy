import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SecurityPanel } from "@/components/settings/security-panel";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { SecurityPosture } from "@/components/settings/security-posture";
import { ErrorMonitorPanel } from "@/components/settings/error-monitor-panel";
import { listErrors } from "@/lib/actions/error-monitor";
import { SessionsPanel } from "@/components/settings/sessions-panel";
import { TrustedDevicesPanel } from "@/components/settings/trusted-devices-panel";
import { listTrustedDevices } from "@/lib/actions/trusted-device";
import { listSessions } from "@/lib/actions/sessions";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert } from "lucide-react";

/**
 * Your own account's security. Not owner-gated — every signed-in person
 * manages their own second factor here, which is why it earns a menu entry
 * of its own rather than sitting behind a tab in Settings.
 */
export default async function SecurityPage() {
  const session = await auth();
  if (!session?.user) return null;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { name: true, email: true, totpEnabled: true, role: true },
  });

  const isOwner = user.role === "owner";
  // Only the owner sees faults: a stack trace names internal paths, and it
  // is the owner who decides whether something needs acting on.
  const errors = isOwner ? await listErrors() : [];
  // Everyone sees their own devices; the owner also sees everyone else's.
  const sessions = await listSessions(isOwner ? "all" : "mine");
  const trustedDevices = await listTrustedDevices();

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">
          Sign-in protection for your own account — {user.name} ({user.email}).
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="flex items-start gap-3 p-4">
          {user.totpEnabled ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          )}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Two-factor authentication</span>
              <Badge variant={user.totpEnabled ? "secondary" : "destructive"}>
                {user.totpEnabled ? "On" : "Off"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {user.totpEnabled
                ? "Sign-in asks for a code from your authenticator app."
                : "Anyone with your password alone can sign in as you."}
              {isOwner && !user.totpEnabled && (
                <>
                  {" "}
                  It is also what{" "}
                  <Link
                    href="/staff"
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    Staff &amp; roles
                  </Link>{" "}
                  asks for before any change to staff, roles or counter limits — until this is
                  on, those changes are blocked.
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {isOwner && (
        <>
          <SecurityPosture />
          <Separator className="max-w-2xl" />
          <ErrorMonitorPanel errors={errors} />
          <Separator className="max-w-2xl" />
        </>
      )}

      <SessionsPanel
        sessions={sessions}
        isOwner={isOwner}
        currentUserId={session.user.id}
      />

      <Separator className="max-w-2xl" />

      <ChangePasswordForm />

      <Separator className="max-w-2xl" />

      <TrustedDevicesPanel devices={trustedDevices} />

      <SecurityPanel totpEnabled={user.totpEnabled} />
    </div>
  );
}
