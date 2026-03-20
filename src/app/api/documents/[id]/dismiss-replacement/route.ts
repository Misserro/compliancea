import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getPendingReplacementForDoc, updatePendingReplacementStatus } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params;
  const newDocumentId = parseInt(id, 10);

  try {
    const pending = getPendingReplacementForDoc(newDocumentId);
    if (!pending) {
      return NextResponse.json({ error: "No pending replacement found" }, { status: 404 });
    }

    updatePendingReplacementStatus(pending.id as number, "dismissed");

    logAction("document", newDocumentId, "version_dismissed", {
      candidateId: pending.candidate_id,
    }, { userId: Number(session.user.id), orgId });

    return NextResponse.json({ message: "Replacement suggestion dismissed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
