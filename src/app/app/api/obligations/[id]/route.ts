import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getObligationById, updateObligation } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function PATCH(
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
    const allowed = ["owner", "escalation_to", "status", "proof_description", "due_date", "title", "description", "activation", "stage"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updateObligation(obId, updates);
    logAction("obligation", obId, "updated", updates);

    const updated = getObligationById(obId);
    return NextResponse.json({ message: "Obligation updated", obligation: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
