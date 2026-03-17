import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { ensureDb } from "@/lib/server-utils";
import { getContractDocumentById } from "@/lib/db-imports";
import { CONTRACT_ATTACHMENTS_DIR } from "@/lib/paths-imports";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractDocId: string }> }
) {
  await ensureDb();
  const { id, contractDocId } = await params;
  const contractId = parseInt(id, 10);
  const contractDocIdNum = parseInt(contractDocId, 10);
  if (isNaN(contractId) || isNaN(contractDocIdNum)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const doc = getContractDocumentById(contractDocIdNum);
    if (!doc || doc.contract_id !== contractId) {
      return NextResponse.json({ error: "Contract document not found" }, { status: 404 });
    }

    // If this is a linked library document, redirect to the library download endpoint
    if (doc.document_id) {
      const redirectUrl = new URL(
        `/api/documents/${doc.document_id}/download`,
        request.url
      );
      return NextResponse.redirect(redirectUrl);
    }

    // If this is an uploaded file, serve it directly
    if (!doc.file_path) {
      return NextResponse.json({ error: "No file attached to this document" }, { status: 404 });
    }

    // Path traversal prevention
    const resolvedPath = path.resolve(doc.file_path);
    const resolvedAttachmentsDir = path.resolve(CONTRACT_ATTACHMENTS_DIR);
    if (!resolvedPath.startsWith(resolvedAttachmentsDir)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
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
