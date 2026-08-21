import { Suspense } from "react";
import { getBranding } from "@/lib/branding";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Resolved here rather than in the form: the form is a client component,
  // and the login screen is the one place branding has to render with no
  // session behind it.
  const branding = await getBranding();

  return (
    <Suspense fallback={null}>
      <LoginForm logoSrc={branding.logo.stacked} pharmacyName={branding.name} />
    </Suspense>
  );
}
