import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getAllDocuments } from "@/lib/db-imports";
import { scanGDrive, getGDriveStatus } from "@/lib/gdrive-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  try {
    const status = getGDriveStatus();
    if (!status.available) {
      return NextResponse.json(
        { error: status.error || "Google Drive not configured" },
        { status: 503 }
      );
    }

    const result = await scanGDrive();
    const documents = getAllDocuments(orgId);

    let message = `Google Drive scan complete. Added: ${result.added}, Updated: ${result.updated}, Removed: ${result.deleted}, Unchanged: ${result.unchanged}`;
    if (result.errors && result.errors.length > 0) {
      message += ` | Errors: ${result.errors.join("; ")}`;
    }

    return NextResponse.json({
      message,
      ...result,
      documents,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Google Drive scan failed: ${errMsg}` }, { status: 500 });
  }
}
