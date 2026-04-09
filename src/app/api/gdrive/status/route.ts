import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getGDriveStatus } from "@/lib/gdrive-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'view')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  try {
    const status = getGDriveStatus(orgId);
    return NextResponse.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ available: false, error: message }, { status: 500 });
  }
}
