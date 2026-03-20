import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  applyVersionLink,
  addLineageEntry,
  addDocumentDiff,
} from "@/lib/db-imports";
import { computeLineDiff } from "@/lib/diff-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(
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
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id } = await params;
  const newDocumentId = parseInt(id, 10);

  try {
    const body = await request.json();
    const { oldDocumentId } = body as { oldDocumentId: number };

    if (!oldDocumentId || typeof oldDocumentId !== "number") {
      return NextResponse.json({ error: "oldDocumentId is required" }, { status: 400 });
    }

    if (oldDocumentId === newDocumentId) {
      return NextResponse.json({ error: "A document cannot replace itself" }, { status: 400 });
    }

    const oldDoc = getDocumentById(oldDocumentId, orgId);
    if (!oldDoc) {
      return NextResponse.json({ error: "Old document not found" }, { status: 404 });
    }

    const newDoc = getDocumentById(newDocumentId, orgId);
    if (!newDoc) {
      return NextResponse.json({ error: "New document not found" }, { status: 404 });
    }

    const { oldDoc: archivedDoc, newDoc: promotedDoc } = applyVersionLink(oldDocumentId, newDocumentId);

    addLineageEntry(newDocumentId, oldDocumentId, "version_of", 1.0);

    if (oldDoc.full_text && newDoc.full_text) {
      const hunks = computeLineDiff(oldDoc.full_text, newDoc.full_text);
      addDocumentDiff(oldDocumentId, newDocumentId, hunks);
    }

    logAction("document", newDocumentId, "version_confirmed", {
      source: "manual",
      oldDocumentId,
      oldVersion: archivedDoc.version,
      newVersion: promotedDoc.version,
    }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({
      message: `Document set as v${promotedDoc.version}, previous version archived`,
      oldDocument: archivedDoc,
      newDocument: promotedDoc,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
