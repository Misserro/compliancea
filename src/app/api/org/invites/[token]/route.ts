import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getOrgInviteByToken, revokeOrgInvite, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
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
    const { token } = await params;

    const invite = getOrgInviteByToken(token);
    if (!invite || invite.orgId !== Number(session.user.orgId)) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    revokeOrgInvite(token);
    saveDb();

    logAction("org_invite", null, "revoked", { email: invite.email, token }, {
      userId: Number(session.user.id),
      orgId: Number(session.user.orgId),
    });

    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
