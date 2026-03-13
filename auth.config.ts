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
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  providers: [],
};
