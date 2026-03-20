import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { getOrgById, restoreOrg, getOrgWithMemberCount, saveDb } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

export const runtime = "nodejs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

export async function POST(
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

    if (!org.deleted_at) {
      return NextResponse.json(
        { error: "Organization is not deleted" },
        { status: 400 }
      );
    }

    // Check 30-day retention window
    const deletedAt = new Date(org.deleted_at).getTime();
    if (Date.now() - deletedAt > RETENTION_DAYS * MS_PER_DAY) {
      return NextResponse.json(
        { error: "Retention period expired" },
        { status: 409 }
      );
    }

    restoreOrg(numericId);
    saveDb();
    logAction("organization", numericId, "restored", { name: org.name, slug: org.slug }, {
      userId: Number(session!.user.id),
    });

    const restored = getOrgWithMemberCount(numericId);

    return NextResponse.json({
      org: {
        id: restored.id,
        name: restored.name,
        slug: restored.slug,
        memberCount: restored.member_count,
        createdAt: restored.created_at,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
