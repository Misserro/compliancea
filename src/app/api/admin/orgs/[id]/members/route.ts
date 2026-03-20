import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import {
  getOrgById,
  getOrgMembers,
  getOrgMemberRecord,
  addOrgMember,
  removeOrgMember,
  getUserByEmail,
  saveDb,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

const VALID_ROLES = ["owner", "admin", "member"];

/** GET /api/admin/orgs/[id]/members — list all members of an org */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const { id } = await params;
    const orgId = parseInt(id, 10);
    if (isNaN(orgId)) {
      return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
    }

    const org = getOrgById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const members = getOrgMembers(orgId);
    return NextResponse.json({ members });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/orgs/[id]/members — add a user to an org by email */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const { id } = await params;
    const orgId = parseInt(id, 10);
    if (isNaN(orgId)) {
      return NextResponse.json({ error: "Invalid org ID" }, { status: 400 });
    }

    const org = getOrgById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "member";

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "No user found with that email address" }, { status: 404 });
    }

    const existing = getOrgMemberRecord(orgId, user.id);
    if (existing) {
      return NextResponse.json({ error: "User is already a member of this organization" }, { status: 409 });
    }

    addOrgMember(orgId, user.id, role, null);
    saveDb();
    logAction("org_member", user.id, "added_by_admin", { orgId, role, email }, {
      userId: Number(session!.user.id),
    });

    const members = getOrgMembers(orgId);
    return NextResponse.json({ members }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
