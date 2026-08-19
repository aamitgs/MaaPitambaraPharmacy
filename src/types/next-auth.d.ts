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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string;
    role: UserRole;
    mfaSetupRequired: boolean;
  }
}
