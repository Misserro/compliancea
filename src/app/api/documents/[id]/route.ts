import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import {
  getDocumentById,
  deleteDocument,
  run,
  saveDb,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDb();
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const doc = getDocumentById(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

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

    logAction("document", id, "deleted", { name: doc.name });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
