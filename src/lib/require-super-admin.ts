import type { Session } from "next-auth";
import { NextResponse } from "next/server";

export function requireSuperAdmin(session: Session | null): Response | null {
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
