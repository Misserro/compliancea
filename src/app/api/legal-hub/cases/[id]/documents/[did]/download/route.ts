export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import path from "path";

import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getCaseDocumentById } from "@/lib/db-imports";
import { getFile } from "@/lib/storage-imports";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * GET /api/legal-hub/cases/[id]/documents/[did]/download
 * Download a case document file
 */
export async function GET(
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

    const doc = getCaseDocumentById(did);
    if (!doc || doc.case_id !== caseId) {
      return NextResponse.json(
        { error: "Case document not found" },
        { status: 404 }
      );
    }

    // If linked library document, redirect to library download endpoint
    if (doc.document_id) {
      const redirectUrl = new URL(
        `/api/documents/${doc.document_id}/download`,
        request.url
      );
      return NextResponse.redirect(redirectUrl);
    }

    // Direct upload -- serve file
    if (!doc.file_path && !doc.storage_key) {
      return NextResponse.json(
        { error: "No file attached to this document" },
        { status: 404 }
      );
    }

    // Read file via storage driver (handles S3 and local)
    const fileBuffer = await getFile(
      orgId,
      doc.storage_backend || "local",
      doc.storage_key,
      doc.file_path
    );

    const fileName = doc.file_name || path.basename(doc.file_path || doc.storage_key || "file");
    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
