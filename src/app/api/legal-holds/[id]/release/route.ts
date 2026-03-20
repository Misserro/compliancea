import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getLegalHoldById, releaseLegalHold } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  const { id } = await params;
  const holdId = parseInt(id, 10);

  try {
    const hold = getLegalHoldById(holdId);
    if (!hold) {
      return NextResponse.json({ error: "Legal hold not found" }, { status: 404 });
    }

    releaseLegalHold(holdId);
    logAction("legal_hold", holdId, "released", { matterName: hold.matter_name }, { userId: Number(session.user.id), orgId });

    const updated = getLegalHoldById(holdId);
    return NextResponse.json({ message: "Legal hold released", hold: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
