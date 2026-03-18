export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getCaseTemplates,
  getCaseTemplateById,
  createCaseTemplate,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

/**
 * Strip dangerous HTML (script tags, inline event handlers) from template body.
 */
function sanitizeTemplateHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "");
}

/**
 * GET /api/legal-hub/templates
 * List templates with optional search/filter
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") || undefined;
    const documentType = searchParams.get("documentType") || undefined;
    const isActiveParam = searchParams.get("isActive");
    const isActive =
      isActiveParam !== null && isActiveParam !== ""
        ? Number(isActiveParam)
        : undefined;

    const templates = getCaseTemplates({ search, documentType, isActive });
    return NextResponse.json({ templates });
  } catch (err: unknown) {
    console.error("Error fetching templates:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/legal-hub/templates
 * Create a new template
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const body = await request.json();

    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const rawTemplateBody = (body.template_body || "").trim();
    if (!rawTemplateBody) {
      return NextResponse.json(
        { error: "Template body is required" },
        { status: 400 }
      );
    }
    const templateBody = sanitizeTemplateHtml(rawTemplateBody);

    const newId = createCaseTemplate({
      name,
      description: body.description || null,
      documentType: body.document_type || null,
      applicableCaseTypes: body.applicable_case_types || [],
      templateBody,
      variablesJson: body.variables_json || [],
    });

    logAction("case_template", newId, "created", { name });

    const template = getCaseTemplateById(newId);
    return NextResponse.json({ template }, { status: 201 });
  } catch (err: unknown) {
    console.error("Error creating template:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
