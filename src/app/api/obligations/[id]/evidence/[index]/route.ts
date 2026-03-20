import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getObligationById, updateObligation } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'full')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id, index } = await params;
  const obId = parseInt(id, 10);
  const evidenceIndex = parseInt(index, 10);

  try {
    const ob = getObligationById(obId);
    if (!ob) {
      return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
    }

    const evidence = JSON.parse(ob.evidence_json || "[]");
    if (evidenceIndex < 0 || evidenceIndex >= evidence.length) {
      return NextResponse.json({ error: "Invalid evidence index" }, { status: 400 });
    }

    const removed = evidence.splice(evidenceIndex, 1)[0];
    updateObligation(obId, { evidence_json: JSON.stringify(evidence) });
    logAction("obligation", obId, "evidence_removed", removed, { userId: Number(session.user.id), orgId });

    const updated = getObligationById(obId);
    return NextResponse.json({ message: "Evidence removed", obligation: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
