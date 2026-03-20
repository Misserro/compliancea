export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getLegalCaseById,
  updateLegalCase,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { LEGAL_CASE_STATUSES } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";

/**
 * POST /api/legal-hub/cases/[id]/status
 * Transition case status
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['legal_hub'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();

  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const legalCase = getLegalCaseById(id);
    if (!legalCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const body = await request.json();

    const newStatus = body.status;
    if (!newStatus || !LEGAL_CASE_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${LEGAL_CASE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const oldStatus = legalCase.status;
    if (newStatus === oldStatus) {
      return NextResponse.json(
        { error: "New status is the same as current status" },
        { status: 400 }
      );
    }

    // Parse existing history and append the old status entry
    let statusHistory: Array<{ status: string; changed_at: string; note: string | null }> = [];
    try {
      statusHistory = JSON.parse(legalCase.status_history_json || "[]");
    } catch {
      statusHistory = [];
    }

    statusHistory.push({
      status: oldStatus,
      changed_at: new Date().toISOString(),
      note: body.note || null,
    });

    updateLegalCase(id, {
      status: newStatus,
      status_history_json: JSON.stringify(statusHistory),
    });

    logAction("legal_case", id, "status_changed", {
      from: oldStatus,
      to: newStatus,
      note: body.note || null,
    }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({
      data: { status: newStatus, status_history: statusHistory },
    });
  } catch (error) {
    console.error("Error transitioning case status:", error);
    return NextResponse.json(
      { error: "Failed to change status" },
      { status: 500 }
    );
  }
}
