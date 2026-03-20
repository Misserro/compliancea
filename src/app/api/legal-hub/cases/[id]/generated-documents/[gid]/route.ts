export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getCaseGeneratedDocById,
  updateCaseGeneratedDoc,
  deleteCaseGeneratedDoc,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/legal-hub/cases/[id]/generated-documents/[gid]
 * Get a single generated document
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string; gid: string }> }
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
    const gid = parseInt(params.gid, 10);
    if (isNaN(gid)) {
      return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
    }

    const generated_document = getCaseGeneratedDocById(gid);
    if (!generated_document) {
      return NextResponse.json(
        { error: "Generated document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ generated_document });
  } catch (err: unknown) {
    console.error("Error fetching generated document:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/legal-hub/cases/[id]/generated-documents/[gid]
 * Update a generated document (content after editing)
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; gid: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    const gid = parseInt(params.gid, 10);
    if (isNaN(caseId) || isNaN(gid)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCaseGeneratedDocById(gid);
    if (!existing) {
      return NextResponse.json(
        { error: "Generated document not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const allowedKeys = [
      "document_name",
      "generated_content",
      "filled_variables_json",
    ];

    const fields: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        fields[key] = body[key];
      }
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updateCaseGeneratedDoc(gid, fields);
    logAction("legal_case", caseId, "generated_doc_updated", { docId: gid }, { userId: Number(session.user.id), orgId });

    const generated_document = getCaseGeneratedDocById(gid);
    return NextResponse.json({ generated_document });
  } catch (err: unknown) {
    console.error("Error updating generated document:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/legal-hub/cases/[id]/generated-documents/[gid]
 * Delete a generated document
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; gid: string }> }
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
    const gid = parseInt(params.gid, 10);
    if (isNaN(caseId) || isNaN(gid)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCaseGeneratedDocById(gid);
    if (!existing) {
      return NextResponse.json(
        { error: "Generated document not found" },
        { status: 404 }
      );
    }

    deleteCaseGeneratedDoc(gid);
    logAction("legal_case", caseId, "generated_doc_deleted", { docId: gid }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ generated_document: { id: gid } });
  } catch (err: unknown) {
    console.error("Error deleting generated document:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
