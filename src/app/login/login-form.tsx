"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { BrandLockup } from "@/components/brand-mark";

const ERROR_MESSAGES: Record<string, string> = {
  MFA_REQUIRED: "Enter the 6-digit code from your authenticator app.",
  INVALID_TOTP: "That code is invalid or expired. Try again.",
  credentials: "Incorrect email or password.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (needsTotp) totpRef.current?.focus();
  }, [needsTotp]);

  async function submit(codeOverride?: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        totpCode: needsTotp ? (codeOverride ?? totpCode) : "",
        redirect: false,
      });

      if (result?.error) {
        const code = result.code ?? result.error;
        if (code === "MFA_REQUIRED") {
          setNeedsTotp(true);
          setShowPassword(false);
          setError(null);
        } else {
          setError(ERROR_MESSAGES[code] ?? "Sign in failed. Please try again.");
          if (needsTotp) setTotpCode("");
        }
        return;
      }

      // Full reload, not router.push: avoids a stale-session-cookie race
      // against a client-side RSC navigation right after sign-in.
      window.location.assign(callbackUrl);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    void submit();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        {/* CardHeader is a grid, so horizontal centring comes from mx-auto on
            the child rather than items-center on the header. The stacked
            artwork carries its own padding — hence the tight margin below. */}
        <CardHeader className="pt-2 pb-1">
          <BrandLockup className="mx-auto w-48" />
          <CardTitle className="sr-only">Maa Pitambara Pharmacy</CardTitle>
          <CardDescription className="mt-1 text-center">
            Sign in to continue to the counter
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                ref={emailRef}
                type="email"
                autoComplete="username"
                value={email}
                disabled={needsTotp || loading}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                  value={password}
                  disabled={needsTotp || loading}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={needsTotp || loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {needsTotp && (
              <div className="space-y-1.5">
                <Label htmlFor="totp">Authenticator code</Label>
                <InputOTP
                  ref={totpRef as React.Ref<React.ElementRef<typeof InputOTP>>}
                  maxLength={6}
                  value={totpCode}
                  onChange={(value) => {
                    setTotpCode(value);
                    if (value.length === 6) void submit(value);
                  }}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {needsTotp && !error && (
              <p className="text-sm text-muted-foreground">
                Password verified. {ERROR_MESSAGES.MFA_REQUIRED}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {needsTotp ? "Verify code" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
