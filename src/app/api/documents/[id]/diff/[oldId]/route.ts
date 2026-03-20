import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb, extractTextFromPath } from "@/lib/server-utils";
import { getDocumentDiff, getDocumentById, addDocumentDiff, updateDocumentMetadata } from "@/lib/db-imports";
import { computeLineDiff } from "@/lib/diff-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

async function resolveFullText(doc: { id: number; full_text?: string | null; path?: string | null }): Promise<string | null> {
  if (doc.full_text) return doc.full_text;
  if (!doc.path) return null;
  try {
    const text = await extractTextFromPath(doc.path);
    // Cache it for future use
    updateDocumentMetadata(doc.id, { full_text: text });
    return text;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; oldId: string }> }
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
  const { id, oldId } = await params;
  const newDocumentId = parseInt(id, 10);
  const oldDocumentId = parseInt(oldId, 10);

  try {
    let stored = getDocumentDiff(oldDocumentId, newDocumentId);

    if (!stored) {
      const oldDoc = getDocumentById(oldDocumentId, orgId);
      const newDoc = getDocumentById(newDocumentId, orgId);

      const oldText = await resolveFullText(oldDoc);
      const newText = await resolveFullText(newDoc);

      if (!oldText || !newText) {
        return NextResponse.json({ error: "Full text not available for diff" }, { status: 422 });
      }
      const hunks = computeLineDiff(oldText, newText);
      addDocumentDiff(oldDocumentId, newDocumentId, hunks);
      return NextResponse.json({
        hunks,
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      hunks: JSON.parse(stored.diff_json as string),
      created_at: stored.created_at,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
