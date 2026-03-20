export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getCaseDocumentById, removeCaseDocument } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

/**
 * DELETE /api/legal-hub/cases/[id]/documents/[did]
 * Remove a document attachment from a case (does NOT delete from document library)
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; did: string }> }
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
    const did = parseInt(params.did, 10);
    if (isNaN(caseId) || isNaN(did)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCaseDocumentById(did);
    if (!existing || existing.case_id !== caseId) {
      return NextResponse.json(
        { error: "Case document not found" },
        { status: 404 }
      );
    }

    // Remove the case_documents row only
    removeCaseDocument(did);

    // Delete physical file from disk only for direct uploads (no library link)
    if (existing.file_path && !existing.document_id) {
      try {
        fs.unlinkSync(existing.file_path);
      } catch (fileErr) {
        console.warn("Failed to delete case document file:", fileErr);
      }
    }

    logAction("case_document", did, "deleted", { caseId }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ case_document: { id: did } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
