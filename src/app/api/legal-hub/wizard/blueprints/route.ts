export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getWizardBlueprints,
  getWizardBlueprintById,
  createWizardBlueprint,
} from "@/lib/db-imports";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/legal-hub/wizard/blueprints
 * List custom blueprints for the current org
 */
export async function GET() {
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
    const blueprints = getWizardBlueprints(orgId);
    return NextResponse.json({ blueprints });
  } catch (err: unknown) {
    console.error("Error fetching wizard blueprints:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/legal-hub/wizard/blueprints
 * Create a new custom blueprint
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json();

    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const sectionsJson = body.sections_json || "[]";
    // Validate sections_json is valid JSON array
    try {
      const parsed = JSON.parse(sectionsJson);
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

    const newId = createWizardBlueprint(orgId, name, sectionsJson);
    const blueprint = getWizardBlueprintById(newId, orgId);
    return NextResponse.json({ blueprint }, { status: 201 });
  } catch (err: unknown) {
    console.error("Error creating wizard blueprint:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
