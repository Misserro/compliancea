import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  deleteDocument,
  run,
  saveDb,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { deleteFile } from "@/lib/storage-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
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

  try {
    await ensureDb();
    const params = await props.params;
    const docId = parseInt(params.id, 10);
    if (isNaN(docId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    const doc = getDocumentById(docId, orgId);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ document: doc });
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json({ error: "Failed to fetch document" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'full')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await ensureDb();
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const doc = getDocumentById(id, orgId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Delete file from storage (S3 or local)
    await deleteFile(orgId, doc.storage_backend, doc.storage_key, doc.path);

    // Delete associated tasks linked to obligations (before deleting obligations)
    run(
      `DELETE FROM tasks WHERE obligation_id IN (
        SELECT id FROM contract_obligations WHERE document_id = ?
      )`,
      [id]
    );

    // Delete associated obligations
    run("DELETE FROM contract_obligations WHERE document_id = ?", [id]);

    // Delete document and its chunks
    deleteDocument(id);

    // Persist changes
    saveDb();

    logAction("document", id, "deleted", { name: doc.name }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
