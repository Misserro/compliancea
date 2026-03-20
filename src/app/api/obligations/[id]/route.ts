import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getObligationById, updateObligation } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function PATCH(
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
    const allowed = ["owner", "escalation_to", "status", "proof_description", "due_date", "title", "description", "activation", "stage", "department", "category", "payment_amount", "payment_currency", "reporting_frequency", "reporting_recipient", "compliance_regulatory_body", "compliance_jurisdiction", "operational_service_type", "operational_sla_metric"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Block direct status change to "finalized" — must use the /finalize endpoint
    if (updates.status === "finalized") {
      return NextResponse.json(
        { error: "Use the finalize endpoint to finalize obligations" },
        { status: 400 }
      );
    }

    updateObligation(obId, updates);
    logAction("obligation", obId, "updated", updates, { userId: Number(session.user.id), orgId });

    const updated = getObligationById(obId);
    return NextResponse.json({ message: "Obligation updated", obligation: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
