export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getCaseDocumentById } from "@/lib/db-imports";
import { CASE_ATTACHMENTS_DIR } from "@/lib/paths-imports";

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

    // Direct upload — serve file from disk
    if (!doc.file_path) {
      return NextResponse.json(
        { error: "No file attached to this document" },
        { status: 404 }
      );
    }

    // Path traversal prevention
    const resolvedPath = path.resolve(doc.file_path);
    const resolvedDocsDir = path.resolve(CASE_ATTACHMENTS_DIR);
    if (!resolvedPath.startsWith(resolvedDocsDir)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify file exists on disk
    try {
      await fs.access(resolvedPath);
    } catch {
      return NextResponse.json(
        { error: "File not found on disk" },
        { status: 404 }
      );
    }

    const fileBuffer = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const fileName = doc.file_name || path.basename(resolvedPath);

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
