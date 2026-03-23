export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getLegalCases,
  getLegalCaseById,
  createLegalCase,
  getOrgMemberRecord,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { LEGAL_CASE_TYPES } from "@/lib/constants";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/legal-hub/cases
 * List cases with optional search + status/type filter
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const caseType = searchParams.get("caseType") || undefined;

    const userId = Number(session.user.id);
    const orgRole = session.user.orgRole as string;
    const cases = getLegalCases({ search, status, caseType, orgId, userId, orgRole });
    return NextResponse.json({ cases });
  } catch (err: unknown) {
    console.error("Error fetching legal cases:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/legal-hub/cases
 * Create a new legal case
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json();

    // Validate required fields
    const title = (body.title || "").trim();
    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const caseType = body.case_type;
    if (!caseType || !LEGAL_CASE_TYPES.includes(caseType)) {
      return NextResponse.json(
        { error: `Invalid case_type. Must be one of: ${LEGAL_CASE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Determine assigned_to based on role
    let assignedTo: number;
    const isMember = !session.user.isSuperAdmin && session.user.orgRole === 'member';

    if (isMember) {
      // Members always auto-assign to themselves
      assignedTo = Number(session.user.id);
    } else if (body.assigned_to !== undefined && body.assigned_to !== null) {
      // Admin/owner/superAdmin with explicit assigned_to
      if (typeof body.assigned_to !== 'number' || !Number.isInteger(body.assigned_to) || body.assigned_to <= 0) {
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
      assignedTo = body.assigned_to;
    } else {
      // Admin/owner/superAdmin without assigned_to — default to self
      assignedTo = Number(session.user.id);
    }

    const newId = createLegalCase({
      title,
      caseType,
      referenceNumber: body.reference_number || null,
      internalNumber: body.internal_number || null,
      procedureType: body.procedure_type || null,
      court: body.court || null,
      courtDivision: body.court_division || null,
      judge: body.judge || null,
      summary: body.summary || null,
      claimDescription: body.claim_description || null,
      claimValue: body.claim_value ?? null,
      claimCurrency: body.claim_currency || "PLN",
      tags: body.tags || [],
      extensionData: body.extension_data || {},
      orgId,
      assignedTo,
    });

    logAction("legal_case", newId, "created", { title, case_type: caseType }, { userId: Number(session.user.id), orgId });

    const newCase = getLegalCaseById(newId, orgId);
    return NextResponse.json({ case: newCase }, { status: 201 });
  } catch (err: unknown) {
    console.error("Error creating legal case:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
