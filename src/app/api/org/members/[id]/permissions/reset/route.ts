import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  resetMemberPermissions,
  getMemberPermissions,
  getOrgMemberRecord,
  saveDb,
} from "@/lib/db-imports";
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

  const orgRole = session.user.orgRole;
  if (orgRole !== "owner" && orgRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDb();
  try {
    const { id } = await params;
    const targetUserId = parseInt(id, 10);
    if (isNaN(targetUserId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const orgId = Number(session.user.orgId);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 404 });
    }

    // Verify target is a member of this org
    const member = getOrgMemberRecord(orgId, targetUserId);
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    resetMemberPermissions(orgId, targetUserId);
    saveDb();

    logAction(
      "member_permissions",
      targetUserId,
      "reset",
      `Reset permissions to org defaults for user ${targetUserId}`,
      { userId: Number(session.user.id), orgId }
    );

    const perms = getMemberPermissions(orgId, targetUserId);
    const permsObj = Object.fromEntries(
      perms.map((p: any) => [p.resource, p.action])
    );

    return NextResponse.json({ permissions: permsObj });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
