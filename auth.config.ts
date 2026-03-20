import type { NextAuthConfig } from "next-auth";

// Edge-compatible config — no Node.js-only imports (no bcrypt, no sql.js).
// Used by middleware for JWT session validation only.
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;
      // Allow public access to invite landing pages without auth
      if (pathname.startsWith("/invite")) return true;
      return !!auth?.user;
    },
  },
  providers: [],
};
