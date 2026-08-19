import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MfaSetupForm } from "@/components/mfa-setup-form";
import { SignOutButton } from "@/components/sign-out-button";

export default async function MfaSetupPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Set up two-factor authentication</CardTitle>
          <CardDescription>
            Your role ({session.user.role.replace("_", " ")}) requires MFA before you can
            continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MfaSetupForm />
          <SignOutButton variant="ghost" className="w-full">
            Cancel and sign out
          </SignOutButton>
        </CardContent>
      </Card>
    </div>
  );
}
