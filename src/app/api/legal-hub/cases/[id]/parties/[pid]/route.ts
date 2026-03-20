export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  updateCaseParty,
  deleteCaseParty,
  getCasePartyById,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

const PARTY_TYPES = ["plaintiff", "defendant", "third_party", "witness", "other"];

/**
 * PATCH /api/legal-hub/cases/[id]/parties/[pid]
 * Update a party
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; pid: string }> }
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
    const caseId = parseInt(params.id, 10);
    const pid = parseInt(params.pid, 10);
    if (isNaN(caseId) || isNaN(pid)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCasePartyById(pid);
    if (!existing || existing.case_id !== caseId) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }

    const body = await request.json();

    const allowedKeys = [
      "party_type", "name", "address",
      "representative_name", "representative_address", "representative_type",
      "notes",
    ];

    const fields: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        fields[key] = body[key];
      }
    }

    if (fields.party_type !== undefined && !PARTY_TYPES.includes(fields.party_type as string)) {
      return NextResponse.json(
        { error: `Invalid party_type. Must be one of: ${PARTY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updateCaseParty(pid, fields);
    logAction("legal_case", caseId, "party_updated", { partyId: pid }, { userId: Number(session.user.id), orgId });

    const updatedParty = getCasePartyById(pid);
    return NextResponse.json({ data: updatedParty });
  } catch (error) {
    console.error("Error updating case party:", error);
    return NextResponse.json(
      { error: "Failed to update party" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/legal-hub/cases/[id]/parties/[pid]
 * Remove a party
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; pid: string }> }
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
    const caseId = parseInt(params.id, 10);
    const pid = parseInt(params.pid, 10);
    if (isNaN(caseId) || isNaN(pid)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCasePartyById(pid);
    if (!existing || existing.case_id !== caseId) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }

    deleteCaseParty(pid);
    logAction("legal_case", caseId, "party_removed", {
      partyId: pid,
      name: existing.name,
    }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ data: { id: pid } });
  } catch (error) {
    console.error("Error deleting case party:", error);
    return NextResponse.json(
      { error: "Failed to delete party" },
      { status: 500 }
    );
  }
}
