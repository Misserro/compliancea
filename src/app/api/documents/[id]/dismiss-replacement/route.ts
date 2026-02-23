import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getPendingReplacementForDoc, updatePendingReplacementStatus } from "@/lib/db-imports";
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
      return NextResponse.json({ error: "No pending replacement found" }, { status: 404 });
    }

    updatePendingReplacementStatus(pending.id as number, "dismissed");

    logAction("document", newDocumentId, "version_dismissed", {
      candidateId: pending.candidate_id,
    });

    return NextResponse.json({ message: "Replacement suggestion dismissed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
