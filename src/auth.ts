import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, isSessionLive } from "@/lib/session-registry";
import { verifyTotpCode } from "@/lib/totp";
import { deviceIsTrusted } from "@/lib/trusted-device-store";
import {
  isLocked,
  lockRemainingSeconds,
  nextFailureState,
} from "@/lib/login-throttle";

const MFA_REQUIRED_ROLES = ["owner", "pharmacist"] as const;

// signIn() with redirect:false surfaces this as `code`, not `error` (which
// stays the fixed "CredentialsSignin" string) — see @auth/core/errors.js.
class MfaRequiredError extends CredentialsSignin {
  code = "MFA_REQUIRED";
}
class InvalidTotpError extends CredentialsSignin {
  code = "INVALID_TOTP";
}
/**
 * Carries the remaining wait in the code so the sign-in screen can say how
 * long, rather than leaving someone retrying blind. This does reveal that
 * the account exists — accepted deliberately: this is a shop-floor till on
 * a LAN, not a public service with an enumeration risk worth a member of
 * staff being unable to tell a lockout from a typo.
 */
class AccountLockedError extends CredentialsSignin {
  code: string;
  constructor(seconds: number) {
    super();
    this.code = `LOCKED:${seconds}`;
  }
}

/** Bcrypt hash of a value nobody has; compared against to keep the timing of
 *  an unknown email indistinguishable from a wrong password. */
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

async function recordFailure(userId: string) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginCount: true, lastFailedLoginAt: true, lockedUntil: true },
  });
  if (!current) return;
  await prisma.user.update({ where: { id: userId }, data: nextFailureState(current) });
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
        if (!user) {
          // Same work as a real comparison, so an unknown email cannot be
          // told apart from a wrong password by how long the reply takes.
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        // Checked before the password: a locked account must cost an
        // attacker the wait whether or not they guessed right, otherwise
        // the lockout leaks which guesses were correct.
        if (isLocked(user)) {
          throw new AccountLockedError(lockRemainingSeconds(user));
        }

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) {
          await recordFailure(user.id);
          return null;
        }

        // Deactivated staff keep their history but lose access; checked
        // here rather than in middleware so an existing session cannot
        // outlive the deactivation by the length of its JWT.
        if (!user.isActive) return null;

        if (user.totpEnabled && user.totpSecret) {
          // A device the user has chosen to trust skips the code — but only
          // when no code was offered. If they typed one it is still checked,
          // so a trusted device can never launder a wrong code into a
          // successful sign-in.
          if (!totpCode) {
            if (!(await deviceIsTrusted(user.id))) {
              throw new MfaRequiredError();
            }
          } else {
            const codeValid = verifyTotpCode(user.totpSecret, totpCode);
            if (!codeValid) {
              // Shares the password counter: guessing a six-digit code is
              // the cheaper attack once a password is known.
              await recordFailure(user.id);
              throw new InvalidTotpError();
            }
          }
        }

        // A clean sign-in wipes the slate.
        if (user.failedLoginCount > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null },
          });
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

        // Register the device so this session can later be seen and ended.
        // The headers are read here rather than in the authorize callback
        // because this is the one place that runs once per sign-in with
        // the request still in scope.
        const h = await headers();
        token.sid = await createSession({
          userId: user.id as string,
          tenantId: user.tenantId as string,
          userAgent: h.get("user-agent"),
          ip: h.get("x-forwarded-for") ?? h.get("x-real-ip"),
        });
      }

      // Checked on every request: revoking a session has to take effect
      // now, not when the token happens to expire. Returning null here is
      // what signs the browser out.
      if (!(await isSessionLive(token.sid as string | undefined))) return null;

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
