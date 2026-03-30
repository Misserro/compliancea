export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getUpcomingDeadlinesForUser } from "@/lib/db-imports";
import { hasPermission } from "@/lib/permissions";
import type { DeadlineAlert } from "@/lib/types";

interface DeadlineRow {
  id: number;
  case_id: number;
  case_title: string;
  title: string;
  deadline_type: string;
  due_date: string;
}

/**
 * GET /api/legal-hub/deadlines/upcoming?days=7
 * Returns overdue and upcoming pending deadlines across all user-visible cases.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === "member") {
    const perm =
      (session.user.permissions as Record<string, string> | null)?.[
        "legal_hub"
      ] ?? "full";
    if (!hasPermission(perm as Parameters<typeof hasPermission>[0], "view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();

  try {
    const { searchParams } = request.nextUrl;
    const days = Math.min(Math.max(parseInt(searchParams.get("days") || "7", 10) || 7, 1), 90);

    const userId = Number(session.user.id);
    const orgRole = session.user.orgRole as string;

    const rows = getUpcomingDeadlinesForUser(orgId, userId, orgRole, days) as DeadlineRow[];

    // Today at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue: DeadlineAlert[] = [];
    const upcoming: DeadlineAlert[] = [];

    for (const row of rows) {
      const dueDate = new Date(row.due_date + "T00:00:00");
      const diffMs = dueDate.getTime() - today.getTime();
      const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const alert: DeadlineAlert = {
        id: row.id,
        caseId: row.case_id,
        caseTitle: row.case_title,
        title: row.title,
        deadline_type: row.deadline_type,
        due_date: row.due_date,
        daysUntil,
      };

      if (daysUntil < 0) {
        overdue.push(alert);
      } else {
        upcoming.push(alert);
      }
    }

    return NextResponse.json({ overdue, upcoming });
  } catch (err: unknown) {
    console.error("Error fetching upcoming deadlines:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
