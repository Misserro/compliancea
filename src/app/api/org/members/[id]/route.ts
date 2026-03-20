import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getOrgMemberRecord,
  updateOrgMemberRole,
  removeOrgMember,
  countOrgOwners,
  saveDb,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

const ALLOWED_ROLES = ["owner", "admin", "member"];

export async function PATCH(
  request: NextRequest,
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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const newRole = body.role;
    if (typeof newRole !== "string" || !ALLOWED_ROLES.includes(newRole)) {
      return NextResponse.json(
        { error: `Invalid role. Must be: ${ALLOWED_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const orgId = Number(session.user.orgId);
    const currentUserId = Number(session.user.id);

    // Check target member exists in org
    const targetMember = getOrgMemberRecord(orgId, targetUserId);
    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Only owners can promote to owner
    if (newRole === "owner" && orgRole !== "owner") {
      return NextResponse.json(
        { error: "Only owners can promote to owner" },
        { status: 403 }
      );
    }

    // Admins can only change member<->admin
    if (orgRole === "admin") {
      if (targetMember.role === "owner") {
        return NextResponse.json(
          { error: "Admins cannot change an owner's role" },
          { status: 403 }
        );
      }
    }

    // Cannot demote yourself if you are the only owner
    if (
      targetUserId === currentUserId &&
      targetMember.role === "owner" &&
      newRole !== "owner"
    ) {
      const ownerCount = countOrgOwners(orgId);
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "Cannot demote the only owner" },
          { status: 400 }
        );
      }
    }

    updateOrgMemberRole(orgId, targetUserId, newRole);
    saveDb();

    logAction(
      "org_member",
      targetUserId,
      "update",
      `Role changed from "${targetMember.role}" to "${newRole}"`
    , { userId: Number(session.user.id), orgId });

    const updated = getOrgMemberRecord(orgId, targetUserId);

    return NextResponse.json({
      message: "Member role updated",
      member: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    const currentUserId = Number(session.user.id);
    const orgId = Number(session.user.orgId);

    // Cannot remove yourself
    if (targetUserId === currentUserId) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the organization" },
        { status: 400 }
      );
    }

    // Check target member exists
    const targetMember = getOrgMemberRecord(orgId, targetUserId);
    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Admins cannot remove owners
    if (orgRole === "admin" && targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Admins cannot remove an owner" },
        { status: 403 }
      );
    }

    removeOrgMember(orgId, targetUserId);
    saveDb();

    logAction(
      "org_member",
      targetUserId,
      "delete",
      `Removed from organization`
    , { userId: Number(session.user.id), orgId });

    return NextResponse.json({ message: "Member removed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
