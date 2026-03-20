import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

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
      // Allow public access to invite and no-org pages without auth
      if (pathname.startsWith("/invite") || pathname.startsWith("/no-org")) return true;
      // Super admin routes require isSuperAdmin flag in JWT
      if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
        return !!(auth?.user as any)?.isSuperAdmin;
      }
      if (!auth?.user) return false;
      // Redirect users with no org (and not super admin) to no-org page
      if (!auth.user.orgId && !(auth?.user as any)?.isSuperAdmin) {
        return NextResponse.redirect(new URL("/no-org", nextUrl));
      }
      return true;
    },
  },
  providers: [],
};
