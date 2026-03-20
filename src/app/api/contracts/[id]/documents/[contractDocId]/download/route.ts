import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import path from "path";

import { ensureDb } from "@/lib/server-utils";
import { getContractDocumentById } from "@/lib/db-imports";
import { getFile } from "@/lib/storage-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractDocId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

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
    if (!doc.file_path && !doc.storage_key) {
      return NextResponse.json({ error: "No file attached to this document" }, { status: 404 });
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
