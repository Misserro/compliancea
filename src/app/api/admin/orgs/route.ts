import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import {
  getAllOrganizations,
  createOrganization,
  createOrgInvite,
  getOrgWithMemberCount,
  get,
  saveDb,
} from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

export async function GET() {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const orgs = getAllOrganizations();

    const now = Date.now();
    const enriched = orgs.map((org: Record<string, unknown>) => {
      let status: string = "active";
      let daysUntilDeletion: number | undefined;

      if (org.deleted_at) {
        const deletedAt = new Date(org.deleted_at as string).getTime();
        const daysSince = Math.ceil((now - deletedAt) / MS_PER_DAY);
        daysUntilDeletion = RETENTION_DAYS - daysSince;

        if (daysUntilDeletion <= 0) {
          status = "expired";
          daysUntilDeletion = 0;
        } else {
          status = "pending_deletion";
        }
      }

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        memberCount: org.member_count,
        createdAt: org.created_at,
        status,
        ...(org.deleted_at
          ? { daysUntilDeletion, deletedAt: org.deleted_at }
          : {}),
      };
    });

    return NextResponse.json({ orgs: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const name =
      typeof body.name === "string" ? body.name.trim() : "";
    const slug =
      typeof body.slug === "string" ? body.slug.trim() : "";
    const ownerEmail =
      typeof body.ownerEmail === "string"
        ? body.ownerEmail.trim().toLowerCase()
        : "";

    if (!name) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    if (!slug) {
      return NextResponse.json(
        { error: "Organization slug is required" },
        { status: 400 }
      );
    }

    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        { error: "Slug must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    // Check slug uniqueness
    const existing = get(
      `SELECT id FROM organizations WHERE slug = ?`,
      [slug]
    );
    if (existing) {
      return NextResponse.json(
        { error: "An organization with this slug already exists" },
        { status: 409 }
      );
    }

    const orgId = createOrganization(name, slug);

    let inviteUrl: string | undefined;
    if (ownerEmail) {
      const invite = createOrgInvite(orgId, ownerEmail, "owner");
      inviteUrl = `${process.env.NEXTAUTH_URL}/invite/${invite.token}`;
    }

    saveDb();
    logAction("organization", orgId, "created", { name, slug, ownerEmail: ownerEmail || null }, {
      userId: Number(session!.user.id),
    });

    const org = getOrgWithMemberCount(orgId);

    const response: Record<string, unknown> = {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        memberCount: org.member_count,
        createdAt: org.created_at,
      },
    };
    if (inviteUrl) {
      response.inviteUrl = inviteUrl;
    }

    return NextResponse.json(response, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
