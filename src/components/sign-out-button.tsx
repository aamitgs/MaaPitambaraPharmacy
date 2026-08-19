"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

export function SignOutButton({
  children,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button {...props} onClick={() => signOut({ callbackUrl: "/login" })}>
      {children ?? "Sign out"}
    </Button>
  );
}
