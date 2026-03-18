export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getLegalCaseById,
  updateLegalCase,
  deleteLegalCase,
  getCaseParties,
  getCaseDeadlines,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

/**
 * GET /api/legal-hub/cases/[id]
 * Get case with parties and deadlines
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

    const legalCase = getLegalCaseById(id);
    if (!legalCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const parties = getCaseParties(id);
    const deadlines = getCaseDeadlines(id);

    return NextResponse.json({
      data: { ...legalCase, parties, deadlines },
    });
  } catch (error) {
    console.error("Error fetching legal case:", error);
    return NextResponse.json(
      { error: "Failed to fetch case" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/legal-hub/cases/[id]
 * Update case metadata
 */
export async function PATCH(
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

    const existing = getLegalCaseById(id);
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const body = await request.json();

    // Build fields from body with allowlist
    const allowedKeys = [
      "title", "case_type", "reference_number", "internal_number",
      "procedure_type", "court", "court_division", "judge",
      "summary", "claim_description", "claim_value", "claim_currency",
      "tags", "extension_data",
    ];

    const fields: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        if (key === "tags" && Array.isArray(body[key])) {
          fields[key] = JSON.stringify(body[key]);
        } else if (key === "extension_data" && typeof body[key] === "object") {
          fields[key] = JSON.stringify(body[key]);
        } else {
          fields[key] = body[key];
        }
      }
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updateLegalCase(id, fields);
    logAction("legal_case", id, "updated", { fields: Object.keys(fields) });

    const updatedCase = getLegalCaseById(id);
    const parties = getCaseParties(id);
    const deadlines = getCaseDeadlines(id);

    return NextResponse.json({
      data: { ...updatedCase, parties, deadlines },
    });
  } catch (error) {
    console.error("Error updating legal case:", error);
    return NextResponse.json(
      { error: "Failed to update case" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/legal-hub/cases/[id]
 * Delete case
 */
export async function DELETE(
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

    const existing = getLegalCaseById(id);
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    deleteLegalCase(id);
    logAction("legal_case", id, "deleted", { title: existing.title });

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("Error deleting legal case:", error);
    return NextResponse.json(
      { error: "Failed to delete case" },
      { status: 500 }
    );
  }
}
