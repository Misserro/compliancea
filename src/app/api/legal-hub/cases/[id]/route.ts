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
  getOrgMemberRecord,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

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
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['legal_hub'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
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

    const legalCase = getLegalCaseById(id, orgId);
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

    const existing = getLegalCaseById(id, orgId);
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const body = await request.json();

    // Validate assigned_to: admin-only, must be a positive integer, must belong to same org
    if (body.assigned_to !== undefined) {
      const isMember = !session.user.isSuperAdmin && session.user.orgRole === 'member';
      if (isMember) {
        return NextResponse.json(
          { error: "Members cannot change case assignment" },
          { status: 403 }
        );
      }
      if (body.assigned_to === null || typeof body.assigned_to !== 'number' || !Number.isInteger(body.assigned_to) || body.assigned_to <= 0) {
        return NextResponse.json(
          { error: "assigned_to must be a positive integer" },
          { status: 400 }
        );
      }
      const targetMember = getOrgMemberRecord(orgId, body.assigned_to);
      if (!targetMember) {
        return NextResponse.json(
          { error: "assigned_to user is not a member of this organization" },
          { status: 400 }
        );
      }
    }

    // Build fields from body with allowlist
    const allowedKeys = [
      "title", "case_type", "reference_number", "internal_number",
      "procedure_type", "court", "court_division", "judge", "status",
      "summary", "claim_description", "claim_value", "claim_currency",
      "tags", "extension_data", "assigned_to", "priority",
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
    logAction("legal_case", id, "updated", { fields: Object.keys(fields) }, { userId: Number(session.user.id), orgId });

    const updatedCase = getLegalCaseById(id, orgId);
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
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['legal_hub'] ?? 'full';
    if (!hasPermission(perm as any, 'full')) {
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

    const existing = getLegalCaseById(id, orgId);
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    deleteLegalCase(id);
    logAction("legal_case", id, "deleted", { title: existing.title }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("Error deleting legal case:", error);
    return NextResponse.json(
      { error: "Failed to delete case" },
      { status: 500 }
    );
  }
}
