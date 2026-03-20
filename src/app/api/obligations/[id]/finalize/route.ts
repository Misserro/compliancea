import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { finalizeObligation } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

/**
 * POST /api/obligations/[id]/finalize
 * Finalize an obligation with note or document
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
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

    logAction("obligation", id, "finalized", { note: note ?? null, documentId: documentId ?? null }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ obligation });
  } catch (error: unknown) {
    console.error("Error finalizing obligation:", error);
    const message = error instanceof Error ? error.message : "Failed to finalize obligation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
