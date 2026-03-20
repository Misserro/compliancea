import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getMemberPermissions,
  setMemberPermission,
  getOrgMemberRecord,
  saveDb,
  PERMISSION_RESOURCES,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

const VALID_ACTIONS = ["none", "view", "edit", "full"];

export async function GET(
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

export async function PUT(
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

    const orgId = Number(session.user.orgId);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 404 });
    }

    // Verify target is a member of this org
    const member = getOrgMemberRecord(orgId, targetUserId);
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const permissions = body.permissions;
    if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "Body must contain a 'permissions' object" },
        { status: 400 }
      );
    }

    const entries = Object.entries(permissions as Record<string, unknown>);
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No permissions provided" },
        { status: 400 }
      );
    }

    for (const [resource, action] of entries) {
      if (!PERMISSION_RESOURCES.includes(resource)) {
        return NextResponse.json(
          { error: `Invalid resource: ${resource}. Valid: ${PERMISSION_RESOURCES.join(", ")}` },
          { status: 400 }
        );
      }
      if (typeof action !== "string" || !VALID_ACTIONS.includes(action)) {
        return NextResponse.json(
          { error: `Invalid action for ${resource}: ${action}. Valid: ${VALID_ACTIONS.join(", ")}` },
          { status: 400 }
        );
      }
    }

    for (const [resource, action] of entries) {
      setMemberPermission(orgId, targetUserId, resource, action as string);
    }

    saveDb();

    logAction(
      "member_permissions",
      targetUserId,
      "update",
      `Updated permissions for user ${targetUserId}: ${JSON.stringify(Object.fromEntries(entries))}`,
      { userId: Number(session.user.id), orgId }
    );

    const updated = getMemberPermissions(orgId, targetUserId);
    const updatedObj = Object.fromEntries(
      updated.map((p: any) => [p.resource, p.action])
    );

    return NextResponse.json({ permissions: updatedObj });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
