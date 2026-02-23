import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  applyVersionLink,
  addLineageEntry,
  addDocumentDiff,
} from "@/lib/db-imports";
import { computeLineDiff } from "@/lib/diff-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const oldDoc = getDocumentById(oldDocumentId);
    if (!oldDoc) {
      return NextResponse.json({ error: "Old document not found" }, { status: 404 });
    }

    const newDoc = getDocumentById(newDocumentId);
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
    });

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
