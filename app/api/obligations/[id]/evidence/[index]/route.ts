import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getObligationById, updateObligation } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  await ensureDb();
  const { id, index } = await params;
  const obId = parseInt(id, 10);
  const evidenceIndex = parseInt(index, 10);

  try {
    const ob = getObligationById(obId);
    if (!ob) {
      return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
    }

    const evidence = JSON.parse(ob.evidence_json || "[]");
    if (evidenceIndex < 0 || evidenceIndex >= evidence.length) {
      return NextResponse.json({ error: "Invalid evidence index" }, { status: 400 });
    }

    const removed = evidence.splice(evidenceIndex, 1)[0];
    updateObligation(obId, { evidence_json: JSON.stringify(evidence) });
    logAction("obligation", obId, "evidence_removed", removed);

    const updated = getObligationById(obId);
    return NextResponse.json({ message: "Evidence removed", obligation: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
