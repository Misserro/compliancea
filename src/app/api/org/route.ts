import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getOrgById, countOrgMembers, updateOrgName, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDb();
  try {
    const orgId = Number(session.user.orgId);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 404 });
    }

    const org = getOrgById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const memberCount = countOrgMembers(orgId);

    return NextResponse.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      memberCount,
      createdAt: org.created_at,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const name = body.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
    }
    if (name.trim().length > 80) {
      return NextResponse.json({ error: "Organization name must be 80 characters or fewer" }, { status: 400 });
    }

    const orgId = Number(session.user.orgId);
    updateOrgName(orgId, name.trim());
    saveDb();

    logAction("organization", orgId, "update", `Name changed to "${name.trim()}"`);

    const org = getOrgById(orgId);
    const memberCount = countOrgMembers(orgId);

    return NextResponse.json({
      message: "Organization updated",
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        memberCount,
        createdAt: org.created_at,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
