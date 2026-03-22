export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getWizardBlueprintById,
  updateWizardBlueprint,
  deleteWizardBlueprint,
} from "@/lib/db-imports";
import { hasPermission } from "@/lib/permissions";

/**
 * PATCH /api/legal-hub/wizard/blueprints/[id]
 * Update a custom blueprint (name and/or sections_json)
 */
export async function PATCH(
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
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getWizardBlueprintById(id, orgId);
    if (!existing) {
      return NextResponse.json(
        { error: "Blueprint not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const fields: { name?: string; sections_json?: string } = {};

    if (body.name !== undefined) {
      const name = (body.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { error: "Name cannot be empty" },
          { status: 400 }
        );
      }
      fields.name = name;
    }

    if (body.sections_json !== undefined) {
      try {
        const parsed = JSON.parse(body.sections_json);
        if (!Array.isArray(parsed)) {
          return NextResponse.json(
            { error: "sections_json must be a JSON array" },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "sections_json must be valid JSON" },
          { status: 400 }
        );
      }
      fields.sections_json = body.sections_json;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updateWizardBlueprint(id, orgId, fields);
    const blueprint = getWizardBlueprintById(id, orgId);
    return NextResponse.json({ blueprint });
  } catch (err: unknown) {
    console.error("Error updating wizard blueprint:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/legal-hub/wizard/blueprints/[id]
 * Delete a custom blueprint
 */
export async function DELETE(
  _request: NextRequest,
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
    if (!hasPermission(perm as any, 'full')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await ensureDb();

  try {
    const params = await props.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getWizardBlueprintById(id, orgId);
    if (!existing) {
      return NextResponse.json(
        { error: "Blueprint not found" },
        { status: 404 }
      );
    }

    deleteWizardBlueprint(id, orgId);
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    console.error("Error deleting wizard blueprint:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
