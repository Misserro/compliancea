import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById, updateDocumentMetadata } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  const { id } = await params;
  const documentId = parseInt(id, 10);

  try {
    const document = getDocumentById(documentId, orgId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const updates = await request.json();
    updateDocumentMetadata(documentId, updates);
    logAction("document", documentId, "updated", { fields: Object.keys(updates) }, { userId: Number(session.user.id), orgId });

    const updatedDocument = getDocumentById(documentId, orgId);
    return NextResponse.json({ message: "Metadata updated", document: updatedDocument });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
