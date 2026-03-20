import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById, updateDocumentStatus } from "@/lib/db-imports";
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
    const body = await request.json();
    const { status: newStatus } = body;
    if (!newStatus) {
      return NextResponse.json({ error: "Missing status field" }, { status: 400 });
    }

    const result = updateDocumentStatus(documentId, newStatus);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logAction("document", documentId, "state_changed", {
      from: result.from,
      to: result.to,
    }, { userId: Number(session.user.id), orgId });

    const updatedDocument = getDocumentById(documentId, orgId);
    return NextResponse.json({
      message: `Status changed: ${result.from} → ${result.to}`,
      document: updatedDocument,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
