import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import {
  getOrgById,
  getOrgMemberRecord,
  removeOrgMember,
  saveDb,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

/** DELETE /api/admin/orgs/[id]/members/[userId] — remove a user from an org */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const { id, userId } = await params;
    const orgId = parseInt(id, 10);
    const targetUserId = parseInt(userId, 10);

    if (isNaN(orgId) || isNaN(targetUserId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const org = getOrgById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const member = getOrgMemberRecord(orgId, targetUserId);
    if (!member) {
      return NextResponse.json({ error: "User is not a member of this organization" }, { status: 404 });
    }

    removeOrgMember(orgId, targetUserId);
    saveDb();
    logAction("org_member", targetUserId, "removed_by_admin", { orgId }, {
      userId: Number(session!.user.id),
    });

    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
