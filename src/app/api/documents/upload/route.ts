import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { auth } from "@/auth";
import { ensureDb, saveUploadedFile } from "@/lib/server-utils";
import { getDocumentByPath, addDocument, getDocumentById, setDocumentStorage, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { DOCUMENTS_DIR } from "@/lib/paths-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      return NextResponse.json({ error: "Only PDF and DOCX files are allowed" }, { status: 400 });
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File size exceeds 10MB limit" }, { status: 400 });
    }

    const folder = formData.get("folder") as string | null;
    const category = formData.get("category") as string | null;

    // Validate category if provided
    if (category && !DEPARTMENTS.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${DEPARTMENTS.join(", ")}` },
        { status: 400 }
      );
    }

    const destDir = folder ? path.join(DOCUMENTS_DIR, folder) : DOCUMENTS_DIR;
    const { filePath, fileName, storageBackend, storageKey } = await saveUploadedFile(file, destDir, orgId);

    // Check if already in database (only for local files with a path)
    const existing = filePath ? getDocumentByPath(filePath, orgId) : null;
    if (existing) {
      return NextResponse.json({ error: "Document already exists in library" }, { status: 409 });
    }

    // Add to database
    const documentId = addDocument(fileName, filePath, folder || null, category || null, orgId);

    // Store storage metadata
    if (storageBackend) {
      setDocumentStorage(documentId, storageBackend, storageKey || null);
    }

    saveDb();
    logAction("document", documentId, "uploaded", { name: fileName, storageBackend: storageBackend || "local" }, { userId: Number(session.user.id), orgId });

    const document = getDocumentById(documentId, orgId);

    return NextResponse.json({
      message: "Document uploaded successfully",
      document,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
