import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { createOrgInvite, listOrgInvites, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

const ALLOWED_INVITE_ROLES = ["member", "admin"];

export async function POST(request: NextRequest) {
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
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    if (typeof role !== "string" || !ALLOWED_INVITE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be: ${ALLOWED_INVITE_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const orgId = Number(session.user.orgId);
    const invite = createOrgInvite(orgId, email, role);

    saveDb();
    logAction("org_invite", null, "created", { email, role, token: invite.token }, {
      userId: Number(session.user.id),
      orgId,
    });

    const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/${invite.token}`;

    return NextResponse.json(
      {
        token: invite.token,
        inviteUrl,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
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
    const orgId = Number(session.user.orgId);
    const invites = listOrgInvites(orgId);

    return NextResponse.json({ invites });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
