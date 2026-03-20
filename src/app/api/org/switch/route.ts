import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getOrgMemberForOrg, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const targetOrgId = body.targetOrgId;
    if (typeof targetOrgId !== "number" || isNaN(targetOrgId)) {
      return NextResponse.json(
        { error: "targetOrgId must be a number" },
        { status: 400 }
      );
    }

    const membership = getOrgMemberForOrg(Number(session.user.id), targetOrgId);
    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 }
      );
    }

    saveDb();
    logAction("organization", targetOrgId, "switch", `User switched to org ${targetOrgId}`, {
      userId: Number(session.user.id),
      orgId: targetOrgId,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
