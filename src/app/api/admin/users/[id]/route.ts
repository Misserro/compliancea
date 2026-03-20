import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { setSuperAdmin, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

/** PATCH /api/admin/users/[id] — toggle isSuperAdmin for a user */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.isSuperAdmin !== "boolean") {
      return NextResponse.json({ error: "isSuperAdmin (boolean) is required" }, { status: 400 });
    }

    setSuperAdmin(userId, body.isSuperAdmin ? 1 : 0);
    saveDb();
    logAction("user", userId, body.isSuperAdmin ? "super_admin_granted" : "super_admin_revoked", {}, {
      userId: Number(session!.user.id),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
