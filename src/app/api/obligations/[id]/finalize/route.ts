import { NextResponse } from "next/server";
import { finalizeObligation, logAction } from "@/lib/db-imports";

/**
 * POST /api/obligations/[id]/finalize
 * Finalize an obligation with note or document
 */
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const { note, documentId } = body;

    // Validate at least one is provided
    if (!note && !documentId) {
      return NextResponse.json(
        { error: "Either note or documentId must be provided" },
        { status: 400 }
      );
    }

    const obligation = await finalizeObligation(id, { note, documentId });

    // Log the action
    await logAction("obligation", id, "finalized", JSON.stringify({ note, documentId }));

    return NextResponse.json({ obligation });
  } catch (error) {
    console.error("Error finalizing obligation:", error);
    const message = error instanceof Error ? error.message : "Failed to finalize obligation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
