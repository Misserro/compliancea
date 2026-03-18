export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getCaseDeadlines,
  addCaseDeadline,
  getCaseDeadlineById,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

const DEADLINE_TYPES = [
  "hearing", "response_deadline", "appeal_deadline",
  "filing_deadline", "payment", "other",
];

/**
 * GET /api/legal-hub/cases/[id]/deadlines
 * List deadlines for a case
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const deadlines = getCaseDeadlines(id);
    return NextResponse.json({ data: deadlines });
  } catch (error) {
    console.error("Error fetching case deadlines:", error);
    return NextResponse.json(
      { error: "Failed to fetch deadlines" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/legal-hub/cases/[id]/deadlines
 * Add a deadline to a case
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();

    const title = (body.title || "").trim();
    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const deadlineType = body.deadline_type;
    if (!deadlineType || !DEADLINE_TYPES.includes(deadlineType)) {
      return NextResponse.json(
        { error: `Invalid deadline_type. Must be one of: ${DEADLINE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const dueDate = body.due_date;
    if (!dueDate) {
      return NextResponse.json(
        { error: "due_date is required" },
        { status: 400 }
      );
    }

    const newId = addCaseDeadline({
      caseId,
      title,
      deadlineType,
      dueDate,
      description: body.description || null,
    });

    logAction("legal_case", caseId, "deadline_added", {
      deadlineId: newId,
      title,
      deadline_type: deadlineType,
      due_date: dueDate,
    });

    const newDeadline = getCaseDeadlineById(newId);
    return NextResponse.json({ data: newDeadline }, { status: 201 });
  } catch (error) {
    console.error("Error adding case deadline:", error);
    return NextResponse.json(
      { error: "Failed to add deadline" },
      { status: 500 }
    );
  }
}
