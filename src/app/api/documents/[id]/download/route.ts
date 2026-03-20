import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import path from "path";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById } from "@/lib/db-imports";
import { getFile } from "@/lib/storage-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id } = await params;
  const documentId = parseInt(id, 10);

  try {
    const document = getDocumentById(documentId, orgId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Read file via storage driver (handles S3 and local)
    const fileBuffer = await getFile(
      orgId,
      document.storage_backend || "local",
      document.storage_key,
      document.path
    );

    // Determine MIME type from filename/path
    const fileName = document.name || path.basename(document.path || document.storage_key || "file");
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
      ".txt": "text/plain",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    // Set headers for inline display or download
    const { searchParams } = new URL(request.url);
    const disposition = searchParams.get("download") === "true" ? "attachment" : "inline";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(document.name)}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
