import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getQaCardById, updateQaCard, deleteQaCard } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const cardId = parseInt(id, 10);

  try {
    const card = getQaCardById(cardId);
    if (!card) {
      return NextResponse.json({ error: "QA card not found" }, { status: 404 });
    }

    const body = await request.json();
    const allowed = ["approved_answer", "evidence_json", "status"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updateQaCard(cardId, updates);
    const updated = getQaCardById(cardId);
    return NextResponse.json({ message: "QA card updated", card: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const cardId = parseInt(id, 10);

  try {
    const card = getQaCardById(cardId);
    if (!card) {
      return NextResponse.json({ error: "QA card not found" }, { status: 404 });
    }

    deleteQaCard(cardId);
    logAction("qa_cards", cardId, "deleted", { questionText: card.question_text });
    return NextResponse.json({ message: "QA card deleted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
