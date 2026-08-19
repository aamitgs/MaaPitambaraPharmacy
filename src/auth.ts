import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/totp";

const MFA_REQUIRED_ROLES = ["owner", "pharmacist"] as const;

// signIn() with redirect:false surfaces this as `code`, not `error` (which
// stays the fixed "CredentialsSignin" string) — see @auth/core/errors.js.
class MfaRequiredError extends CredentialsSignin {
  code = "MFA_REQUIRED";
}
class InvalidTotpError extends CredentialsSignin {
  code = "INVALID_TOTP";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totpCode: {},
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        const totpCode = credentials?.totpCode ? String(credentials.totpCode) : undefined;

        if (!email || !password) return null;

        const user = await prisma.user.findFirst({ where: { email } });
        if (!user) return null;

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) return null;

        if (user.totpEnabled && user.totpSecret) {
          if (!totpCode) {
            throw new MfaRequiredError();
          }
          const codeValid = verifyTotpCode(user.totpSecret, totpCode);
          if (!codeValid) {
            throw new InvalidTotpError();
          }
        }

        const mfaSetupRequired =
          !user.totpEnabled &&
          MFA_REQUIRED_ROLES.includes(user.role as (typeof MFA_REQUIRED_ROLES)[number]);

        return {
          id: user.id,
          tenantId: user.tenantId,
          role: user.role,
          name: user.name,
          email: user.email,
          mfaSetupRequired,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.tenantId = user.tenantId;
        token.role = user.role;
        token.mfaSetupRequired = user.mfaSetupRequired;
      }
      // Refresh the mfaSetupRequired flag after the user finishes MFA setup.
      if (trigger === "update" && token.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (dbUser) {
          token.mfaSetupRequired =
            !dbUser.totpEnabled &&
            MFA_REQUIRED_ROLES.includes(dbUser.role as (typeof MFA_REQUIRED_ROLES)[number]);
        }
      }
      return token;
    },
  },
});
