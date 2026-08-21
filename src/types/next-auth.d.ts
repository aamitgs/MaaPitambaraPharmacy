import type { UserRole } from "@/generated/prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    tenantId: string;
    role: UserRole;
    mfaSetupRequired: boolean;
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: UserRole;
      mfaSetupRequired: boolean;
      name?: string | null;
      email?: string | null;
    };
    /// Identifies this signed-in device in the session registry, so the
    /// list of open sessions can mark which one you are looking at it
    /// from. Absent on tokens issued before the registry existed.
    sid?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string;
    role: UserRole;
    mfaSetupRequired: boolean;
    /// The UserSession row backing this token. Null when the registry
    /// write failed at sign-in, which is deliberately not fatal.
    sid?: string | null;
  }
}
