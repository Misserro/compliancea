export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getLegalCaseById,
  getCaseTemplateById,
  getCaseParties,
  getCaseDeadlines,
  createCaseGeneratedDoc,
  getCaseGeneratedDocById,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";
import { fillTemplate } from "@/lib/template-engine-imports";
import { hasPermission } from "@/lib/permissions";

/**
 * POST /api/legal-hub/cases/[id]/generate
 * Fill a template with case data and create a generated document
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = Number(session.user.orgId);
  // Permission check (member role only; owner/admin/superAdmin bypass)
  if (!session.user.isSuperAdmin && session.user.orgRole === 'member') {
    const perm = (session.user.permissions as Record<string, string> | null)?.['legal_hub'] ?? 'full';
    if (!hasPermission(perm as any, 'edit')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();

  try {
    const params = await props.params;
    const caseId = parseInt(params.id, 10);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    const legalCase = getLegalCaseById(caseId, orgId);
    if (!legalCase) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const templateId = body.template_id;
    if (!templateId) {
      return NextResponse.json(
        { error: "template_id is required" },
        { status: 400 }
      );
    }

    const template = getCaseTemplateById(templateId);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const parties = getCaseParties(caseId);
    const deadlines = getCaseDeadlines(caseId);
    const documentName =
      (body.document_name || "").trim() || template.name;

    const { html: generatedContent, snapshot } = fillTemplate(
      template.template_body,
      legalCase,
      parties,
      deadlines
    );

    const newId = createCaseGeneratedDoc({
      caseId,
      templateId: template.id,
      templateName: template.name,
      documentName,
      generatedContent,
      filledVariablesJson: JSON.stringify(snapshot),
    });

    logAction("legal_case", caseId, "document_generated", {
      templateId: template.id,
      templateName: template.name,
      documentName,
    }, { userId: Number(session.user.id), orgId });

    const generated_document = getCaseGeneratedDocById(newId);
    return NextResponse.json({ generated_document }, { status: 201 });
  } catch (err: unknown) {
    console.error("Error generating document:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
