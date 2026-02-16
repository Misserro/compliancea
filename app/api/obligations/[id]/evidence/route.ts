import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getObligationById, updateObligation, getDocumentById } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const obId = parseInt(id, 10);

  try {
    const ob = getObligationById(obId);
    if (!ob) {
      return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
    }

    const body = await request.json();
    const { documentId, note } = body;
    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    const evidenceDoc = getDocumentById(documentId);
    if (!evidenceDoc) {
      return NextResponse.json({ error: "Evidence document not found" }, { status: 404 });
    }

    const evidence = JSON.parse(ob.evidence_json || "[]");
    evidence.push({
      documentId,
      documentName: evidenceDoc.name,
      note: note || null,
      addedAt: new Date().toISOString(),
    });

    updateObligation(obId, { evidence_json: JSON.stringify(evidence) });
    logAction("obligation", obId, "evidence_added", { documentId, documentName: evidenceDoc.name });

    const updated = getObligationById(obId);
    return NextResponse.json({ message: "Evidence added", obligation: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
