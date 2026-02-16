import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/server-utils";
import { getAllLegalHolds, getLegalHoldById, createLegalHold } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await ensureDb();
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";
    const holds = getAllLegalHolds(activeOnly);
    return NextResponse.json({ holds });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await ensureDb();
  try {
    const body = await request.json();
    const { matterName, scope } = body;
    if (!matterName || !scope) {
      return NextResponse.json(
        { error: "Missing required fields: matterName, scope" },
        { status: 400 }
      );
    }

    const id = createLegalHold(matterName, scope);
    logAction("legal_hold", id, "created", { matterName, scope });

    const hold = getLegalHoldById(id);
    return NextResponse.json({ message: "Legal hold created", hold });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
