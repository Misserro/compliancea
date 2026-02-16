import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById, updateDocumentMetadata } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const documentId = parseInt(id, 10);

  try {
    const document = getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const body = await request.json();
    const { tags } = body;
    const updates: Record<string, unknown> = { confirmed_tags: 1 };
    if (tags !== undefined) {
      updates.tags = JSON.stringify(Array.isArray(tags) ? tags : []);
    }

    updateDocumentMetadata(documentId, updates);
    logAction("document", documentId, "tags_confirmed", { tags });

    const updatedDocument = getDocumentById(documentId);
    return NextResponse.json({ message: "Tags confirmed", document: updatedDocument });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
