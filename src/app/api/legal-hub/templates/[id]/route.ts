export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getCaseTemplateById,
  updateCaseTemplate,
  deleteCaseTemplate,
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
 * GET /api/legal-hub/templates/[id]
 * Get a single template
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const template = getCaseTemplateById(id);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ template });
  } catch (err: unknown) {
    console.error("Error fetching template:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/legal-hub/templates/[id]
 * Update a template
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCaseTemplateById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const allowedKeys = [
      "name",
      "description",
      "document_type",
      "applicable_case_types",
      "template_body",
      "variables_json",
      "is_active",
    ];

    const fields: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        if (key === "applicable_case_types" && Array.isArray(body[key])) {
          fields[key] = JSON.stringify(body[key]);
        } else if (key === "variables_json" && Array.isArray(body[key])) {
          fields[key] = JSON.stringify(body[key]);
        } else if (key === "template_body" && typeof body[key] === "string") {
          fields[key] = sanitizeTemplateHtml(body[key]);
        } else {
          fields[key] = body[key];
        }
      }
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updateCaseTemplate(id, fields);
    logAction("case_template", id, "updated", {
      fields: Object.keys(fields),
    });

    const template = getCaseTemplateById(id);
    return NextResponse.json({ template });
  } catch (err: unknown) {
    console.error("Error updating template:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/legal-hub/templates/[id]
 * Delete a template
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();

  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getCaseTemplateById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    deleteCaseTemplate(id);
    logAction("case_template", id, "deleted", { name: existing.name });

    return NextResponse.json({ template: { id } });
  } catch (err: unknown) {
    console.error("Error deleting template:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
