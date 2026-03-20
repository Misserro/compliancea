import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getObligationById, updateObligation, getDocumentById } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['contracts'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id } = await params;
  const obId = parseInt(id, 10);

  try {
    const ob = getObligationById(obId);
    if (!ob) {
      return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
    }

    const body = await request.json();
    const { documentId, note } = body;
    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    const evidenceDoc = getDocumentById(documentId, orgId);
    if (!evidenceDoc) {
      return NextResponse.json({ error: "Evidence document not found" }, { status: 404 });
    }

    const evidence = JSON.parse(ob.evidence_json || "[]");
    evidence.push({
      documentId,
      documentName: evidenceDoc.name,
      note: note || null,
      addedAt: new Date().toISOString(),
    });

    updateObligation(obId, { evidence_json: JSON.stringify(evidence) });
    logAction("obligation", obId, "evidence_added", { documentId, documentName: evidenceDoc.name }, { userId: Number(session.user.id), orgId });

    const updated = getObligationById(obId);
    return NextResponse.json({ message: "Evidence added", obligation: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
