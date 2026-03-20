import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getDocumentById, getObligationsByDocumentId, getObligationById, insertObligation, spawnDueObligations } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
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
    if (!hasPermission(perm as any, 'view')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id } = await params;
  const docId = parseInt(id, 10);

  try {
    const doc = getDocumentById(docId, orgId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    spawnDueObligations(docId);

    const obligations = getObligationsByDocumentId(docId);
    return NextResponse.json({ obligations });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const perm = (session.user.permissions as Record<string, string> | null)?.['documents'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();
  const { id } = await params;
  const docId = parseInt(id, 10);
  try {
    if (isNaN(docId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    const doc = getDocumentById(docId, orgId);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    const body = await request.json();
    if (!body.title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    const recurrenceIntervalParsed = parseInt(body.recurrenceInterval, 10);
    const recurrenceInterval = isNaN(recurrenceIntervalParsed) ? null : recurrenceIntervalParsed;

    const newId = insertObligation({
      documentId: docId,
      obligationType: body.obligationType || "general",
      title: body.title,
      description: body.description,
      clauseReference: body.clauseReference,
      dueDate: body.dueDate,
      recurrence: body.recurrence,
      noticePeriodDays: body.noticePeriodDays ?? null,
      owner: body.owner,
      escalationTo: body.escalationTo,
      proofDescription: body.proofDescription,
      evidenceJson: "[]",
      category: body.category,
      department: body.department,
      activation: body.activation,
      summary: body.summary,
      detailsJson: "{}",
      penalties: body.penalties,
      stage: "active",
      startDate: body.startDate,
      isRepeating: body.isRepeating ?? false,
      recurrenceInterval,
      parentObligationId: body.parentObligationId ?? null,
      paymentAmount: body.paymentAmount ?? null,
      paymentCurrency: body.paymentCurrency || null,
      reportingFrequency: body.reportingFrequency || null,
      reportingRecipient: body.reportingRecipient || null,
      complianceRegulatoryBody: body.complianceRegulatoryBody || null,
      complianceJurisdiction: body.complianceJurisdiction || null,
      operationalServiceType: body.operationalServiceType || null,
      operationalSlaMetric: body.operationalSlaMetric || null,
        orgId,
      });
    logAction("obligation", newId, "created", { documentId: docId, title: body.title }, { userId: Number(session.user.id), orgId });
    const created = getObligationById(newId);
    return NextResponse.json({ obligation: created }, { status: 201 });
  } catch (err: unknown) {
    console.error("Error creating obligation:", err);
    return NextResponse.json({ error: "Failed to create obligation" }, { status: 500 });
  }
}
