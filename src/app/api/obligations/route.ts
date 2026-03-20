import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getAllObligations, getOverdueObligations, getUpcomingObligations } from "@/lib/db-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "active"; // active | finalized | all

    const allObligations = getAllObligations(orgId);
    const overdue = getOverdueObligations(orgId);
    const upcoming = getUpcomingObligations(30, orgId);

    let obligations;
    if (filter === "active") {
      obligations = allObligations.filter((o: { status: string }) => o.status === "active");
    } else if (filter === "finalized") {
      obligations = allObligations.filter((o: { status: string }) => o.status === "finalized");
    } else {
      obligations = allObligations;
    }

    return NextResponse.json({
      obligations,
      stats: {
        total: allObligations.length,
        active: allObligations.filter((o: { status: string }) => o.status === "active").length,
        finalized: allObligations.filter((o: { status: string }) => o.status === "finalized").length,
        met: allObligations.filter((o: { status: string }) => o.status === "met").length,
        overdue: overdue.length,
        upcoming: upcoming.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
