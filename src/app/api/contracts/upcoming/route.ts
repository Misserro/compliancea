import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getUpcomingObligationsAllContracts } from "@/lib/db-imports";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/contracts/upcoming
 * Get all obligations due in next 30 days across all contracts
 */
export async function GET(request: Request) {
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
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    if (isNaN(days) || days < 1) {
      return NextResponse.json(
        { error: "Invalid days parameter" },
        { status: 400 }
      );
    }

    const obligations = await getUpcomingObligationsAllContracts(days, orgId);
    return NextResponse.json({ obligations });
  } catch (error) {
    console.error("Error fetching upcoming obligations:", error);
    return NextResponse.json(
      { error: "Failed to fetch upcoming obligations" },
      { status: 500 }
    );
  }
}
