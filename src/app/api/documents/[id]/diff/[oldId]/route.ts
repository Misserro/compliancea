import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentDiff, getDocumentById, addDocumentDiff } from "@/lib/db-imports";
import { computeLineDiff } from "@/lib/diff-imports";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; oldId: string }> }
) {
  await ensureDb();
  const { id, oldId } = await params;
  const newDocumentId = parseInt(id, 10);
  const oldDocumentId = parseInt(oldId, 10);

  try {
    let stored = getDocumentDiff(oldDocumentId, newDocumentId);

    if (!stored) {
      const oldDoc = getDocumentById(oldDocumentId);
      const newDoc = getDocumentById(newDocumentId);
      if (!oldDoc?.full_text || !newDoc?.full_text) {
        return NextResponse.json({ error: "Full text not available for diff" }, { status: 422 });
      }
      const hunks = computeLineDiff(oldDoc.full_text, newDoc.full_text);
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
