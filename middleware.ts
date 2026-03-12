import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  /*
   * Match all routes EXCEPT:
   * - /api/auth/* (NextAuth endpoints)
   * - /login and /register (auth pages)
   * - /_next/* (Next.js internals)
   * - /favicon.ico, static files
   */
  matcher: [
    "/((?!api/auth|login|register|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
