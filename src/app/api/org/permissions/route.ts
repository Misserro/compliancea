import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import {
  getOrgPermissionDefaults,
  setOrgPermissionDefault,
  saveDb,
  PERMISSION_RESOURCES,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

const VALID_ACTIONS = ["none", "view", "edit", "full"];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgRole = session.user.orgRole;
  if (orgRole !== "owner" && orgRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDb();
  try {
    const orgId = Number(session.user.orgId);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 404 });
    }

    const defaults = getOrgPermissionDefaults(orgId);
    const defaultsObj = Object.fromEntries(
      defaults.map((d: any) => [d.resource, d.action])
    );

    return NextResponse.json({ defaults: defaultsObj });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgRole = session.user.orgRole;
  if (orgRole !== "owner" && orgRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDb();
  try {
    const orgId = Number(session.user.orgId);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const defaults = body.defaults;
    if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) {
      return NextResponse.json(
        { error: "Body must contain a 'defaults' object" },
        { status: 400 }
      );
    }

    const entries = Object.entries(defaults as Record<string, unknown>);
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No permissions provided" },
        { status: 400 }
      );
    }

    for (const [resource, action] of entries) {
      if (!PERMISSION_RESOURCES.includes(resource)) {
        return NextResponse.json(
          { error: `Invalid resource: ${resource}. Valid: ${PERMISSION_RESOURCES.join(", ")}` },
          { status: 400 }
        );
      }
      if (typeof action !== "string" || !VALID_ACTIONS.includes(action)) {
        return NextResponse.json(
          { error: `Invalid action for ${resource}: ${action}. Valid: ${VALID_ACTIONS.join(", ")}` },
          { status: 400 }
        );
      }
    }

    for (const [resource, action] of entries) {
      setOrgPermissionDefault(orgId, resource, action as string);
    }

    saveDb();

    logAction(
      "org_permissions",
      orgId,
      "update",
      `Updated org permission defaults: ${JSON.stringify(Object.fromEntries(entries))}`,
      { userId: Number(session.user.id), orgId }
    );

    const updated = getOrgPermissionDefaults(orgId);
    const updatedObj = Object.fromEntries(
      updated.map((d: any) => [d.resource, d.action])
    );

    return NextResponse.json({ defaults: updatedObj });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
