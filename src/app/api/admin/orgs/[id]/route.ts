import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import {
  getOrgWithMemberCount,
  getOrgMembers,
  getOrgById,
  updateOrgName,
  softDeleteOrg,
  get,
  run,
  saveDb,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const { id } = await params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const org = getOrgWithMemberCount(numericId);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const members = getOrgMembers(numericId);

    return NextResponse.json({ org, members });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const { id } = await params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = getOrgById(numericId);
    if (!existing) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const allowed = ["name", "slug"];
    const updates: Record<string, string> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== "string" || !(body[key] as string).trim()) {
          return NextResponse.json(
            { error: `${key} must be a non-empty string` },
            { status: 400 }
          );
        }
        updates[key] = (body[key] as string).trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Validate slug format if provided
    if (updates.slug && !SLUG_PATTERN.test(updates.slug)) {
      return NextResponse.json(
        { error: "Slug must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    // Check slug uniqueness if provided (excluding current org)
    if (updates.slug) {
      const slugConflict = get(
        `SELECT id FROM organizations WHERE slug = ? AND id != ?`,
        [updates.slug, numericId]
      );
      if (slugConflict) {
        return NextResponse.json(
          { error: "An organization with this slug already exists" },
          { status: 409 }
        );
      }
    }

    if (updates.name) {
      updateOrgName(numericId, updates.name);
    }
    if (updates.slug) {
      run(`UPDATE organizations SET slug = ? WHERE id = ?`, [
        updates.slug,
        numericId,
      ]);
    }

    saveDb();
    logAction("organization", numericId, "updated", updates, {
      userId: Number(session!.user.id),
    });

    const org = getOrgWithMemberCount(numericId);

    return NextResponse.json({
      message: "Organization updated",
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        memberCount: org.member_count,
        createdAt: org.created_at,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const { id } = await params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const org = getOrgById(numericId);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (org.deleted_at) {
      return NextResponse.json(
        { error: "Organization is already deleted" },
        { status: 409 }
      );
    }

    softDeleteOrg(numericId);
    saveDb();
    logAction("organization", numericId, "soft_deleted", { name: org.name, slug: org.slug }, {
      userId: Number(session!.user.id),
    });

    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
