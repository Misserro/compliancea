export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  updateCaseDeadline,
  deleteCaseDeadline,
  getCaseDeadlineById,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

const DEADLINE_TYPES = [
  "hearing", "response_deadline", "appeal_deadline",
  "filing_deadline", "payment", "other",
];
const DEADLINE_STATUSES = ["pending", "met", "missed", "cancelled"];

/**
 * PATCH /api/legal-hub/cases/[id]/deadlines/[did]
 * Update a deadline
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; did: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    const did = parseInt(params.did, 10);
    if (isNaN(caseId) || isNaN(did)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCaseDeadlineById(did);
    if (!existing || existing.case_id !== caseId) {
      return NextResponse.json({ error: "Deadline not found" }, { status: 404 });
    }

    const body = await request.json();

    const allowedKeys = [
      "title", "deadline_type", "due_date", "description",
      "status", "completed_at",
    ];

    const fields: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        fields[key] = body[key];
      }
    }

    if (fields.deadline_type !== undefined && !DEADLINE_TYPES.includes(fields.deadline_type as string)) {
      return NextResponse.json(
        { error: `Invalid deadline_type. Must be one of: ${DEADLINE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (fields.status !== undefined && !DEADLINE_STATUSES.includes(fields.status as string)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${DEADLINE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Auto-set completed_at when marking as met
    if (fields.status === "met" && !fields.completed_at) {
      fields.completed_at = new Date().toISOString();
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updateCaseDeadline(did, fields);
    logAction("legal_case", caseId, "deadline_updated", {
      deadlineId: did,
      ...(fields.status ? { status: fields.status } : {}),
    });

    const updatedDeadline = getCaseDeadlineById(did);
    return NextResponse.json({ data: updatedDeadline });
  } catch (error) {
    console.error("Error updating case deadline:", error);
    return NextResponse.json(
      { error: "Failed to update deadline" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/legal-hub/cases/[id]/deadlines/[did]
 * Delete a deadline
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; did: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    const did = parseInt(params.did, 10);
    if (isNaN(caseId) || isNaN(did)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCaseDeadlineById(did);
    if (!existing || existing.case_id !== caseId) {
      return NextResponse.json({ error: "Deadline not found" }, { status: 404 });
    }

    deleteCaseDeadline(did);
    logAction("legal_case", caseId, "deadline_removed", {
      deadlineId: did,
      title: existing.title,
    });

    return NextResponse.json({ data: { id: did } });
  } catch (error) {
    console.error("Error deleting case deadline:", error);
    return NextResponse.json(
      { error: "Failed to delete deadline" },
      { status: 500 }
    );
  }
}
