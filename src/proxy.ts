import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  // /api/backup/scheduled authenticates itself via a shared-secret header
  // (it's meant to be hit by an external cron, not a logged-in browser
  // session) so it's excluded here rather than threaded through the
  // session-based `authorized` callback.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/backup/scheduled).*)"],
};
