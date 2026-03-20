export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getCaseDocumentById, run } from "@/lib/db-imports";
import { ingestCaseDocumentSafe } from "@/lib/ingest-case-document";
import { hasPermission } from "@/lib/permissions";

/**
 * POST /api/legal-hub/cases/[id]/documents/[did]/reindex
 * Re-triggers indexing for a specific case document.
 * Used for documents that failed or were uploaded before indexing was working.
 */
export async function POST(
  _request: NextRequest,
  props: { params: Promise<{ id: string; did: string }> }
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

  const { id, did } = await props.params;
  const caseId = parseInt(id, 10);
  const caseDocId = parseInt(did, 10);

  if (isNaN(caseId) || isNaN(caseDocId) || !did) {
    return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
  }

  const caseDoc = getCaseDocumentById(caseDocId) as { case_id: number; document_id: number | null } | null;
  if (!caseDoc || caseDoc.case_id !== caseId) {
    return NextResponse.json({ error: "Document not found in this case" }, { status: 404 });
  }

  if (!caseDoc.document_id) {
    return NextResponse.json({ error: "Document has no library record" }, { status: 400 });
  }

  // Reset processed flag and clear error so ingestion runs fresh
  run("UPDATE documents SET processed = 0, processing_error = NULL WHERE id = ?", [caseDoc.document_id]);

  await ingestCaseDocumentSafe(caseDoc.document_id);

  return NextResponse.json({ ok: true });
}
