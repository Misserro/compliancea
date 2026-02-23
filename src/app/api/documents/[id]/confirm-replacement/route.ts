import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getPendingReplacementForDoc,
  updatePendingReplacementStatus,
  applyVersionLink,
  addLineageEntry,
  addDocumentDiff,
  getDocumentById,
} from "@/lib/db-imports";
import { computeLineDiff } from "@/lib/diff-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const newDocumentId = parseInt(id, 10);

  try {
    const pending = getPendingReplacementForDoc(newDocumentId);
    if (!pending) {
      return NextResponse.json({ error: "No pending replacement found for this document" }, { status: 404 });
    }

    const oldDocumentId = pending.candidate_id as number;

    const { oldDoc, newDoc } = applyVersionLink(oldDocumentId, newDocumentId);

    addLineageEntry(newDocumentId, oldDocumentId, "version_of", 1.0);

    const oldFull = getDocumentById(oldDocumentId);
    const newFull = getDocumentById(newDocumentId);
    if (oldFull?.full_text && newFull?.full_text) {
      const hunks = computeLineDiff(oldFull.full_text, newFull.full_text);
      addDocumentDiff(oldDocumentId, newDocumentId, hunks);
    }

    updatePendingReplacementStatus(pending.id as number, "confirmed");

    logAction("document", newDocumentId, "version_confirmed", {
      source: "auto-confirmed",
      oldDocumentId,
      oldVersion: oldDoc.version,
      newVersion: newDoc.version,
    });

    return NextResponse.json({
      message: `Document confirmed as v${newDoc.version}, previous version archived`,
      oldDocument: oldDoc,
      newDocument: newDoc,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
