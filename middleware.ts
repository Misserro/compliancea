import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

// Export auth as the default middleware.
// NextAuth calls the `authorized` callback from authConfig:
//   authorized({ auth }) { return !!auth?.user; }
// When it returns false, NextAuth redirects to pages.signIn (/login).
export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/invites|login|register|invite|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
