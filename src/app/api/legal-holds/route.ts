import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getAllLegalHolds, getLegalHoldById, createLegalHold } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

  await ensureDb();
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";
    const holds = getAllLegalHolds(activeOnly, orgId);
    return NextResponse.json({ holds });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);

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

    const id = createLegalHold(matterName, scope, orgId);
    logAction("legal_hold", id, "created", { matterName, scope }, { userId: Number(session.user.id), orgId });

    const hold = getLegalHoldById(id);
    return NextResponse.json({ message: "Legal hold created", hold });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
