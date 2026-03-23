export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getFirmStats } from "@/lib/db-imports";

/**
 * GET /api/legal-hub/firm-stats
 * Admin/owner only — returns case stats + member roster for "My law firm" tab
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Positive admin guard: only admin, owner, or superAdmin may access
  const isAdmin =
    session.user.orgRole === "admin" ||
    session.user.orgRole === "owner" ||
    session.user.isSuperAdmin === true;
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDb();

  try {
    const orgId = Number(session.user.orgId);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 404 });
    }

    const stats = getFirmStats(orgId);
    return NextResponse.json(stats);
  } catch (err: unknown) {
    console.error("Error fetching firm stats:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
