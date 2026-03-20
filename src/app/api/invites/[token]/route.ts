import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getOrgInviteByToken, getOrgMemberRecord, addOrgMember, acceptOrgInvite, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  await ensureDb();
  try {
    const { token } = await params;

    const invite = getOrgInviteByToken(token);

    if (!invite) {
      return NextResponse.json({ valid: false, reason: "not_found" });
    }

    if (invite.acceptedAt) {
      return NextResponse.json({ valid: false, reason: "already_accepted" });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }

    return NextResponse.json({
      valid: true,
      orgName: invite.orgName,
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();
  try {
    const { token } = await params;
    const userId = Number(session.user.id);

    const invite = getOrgInviteByToken(token);

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.acceptedAt) {
      return NextResponse.json({ error: "This invite has already been used" }, { status: 409 });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
    }

    // Check if user is already a member of the invited org
    const existingMember = getOrgMemberRecord(invite.orgId, userId);
    if (existingMember) {
      return NextResponse.json(
        { error: "Already a member of this organization" },
        { status: 409 }
      );
    }

    // Enroll user in the org with the invited role
    addOrgMember(invite.orgId, userId, invite.role, null);
    acceptOrgInvite(token);

    // CRITICAL: saveDb BEFORE logAction (per rest-api.md standard)
    saveDb();
    logAction("org_invite", null, "accepted", { email: invite.email, role: invite.role, token }, {
      userId,
      orgId: invite.orgId,
    });

    return NextResponse.json({
      orgId: invite.orgId,
      orgName: invite.orgName,
      role: invite.role,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
