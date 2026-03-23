export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { updateMemberProfile } from "@/lib/db-imports";
import { logAction } from "@/lib/audit-imports";

const PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "specialization",
  "bar_registration_number",
] as const;

/**
 * PATCH /api/org/members/profile
 * Update lawyer profile fields on org_members.
 * Members can update their own profile; admins can update any member's profile
 * by providing target_user_id in the body.
 */
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();

    // Determine target user
    const sessionUserId = Number(session.user.id);
    let targetUserId = sessionUserId;

    if (body.target_user_id !== undefined && body.target_user_id !== null) {
      targetUserId = Number(body.target_user_id);
      if (isNaN(targetUserId) || targetUserId <= 0) {
        return NextResponse.json({ error: "Invalid target_user_id" }, { status: 400 });
      }

      // If targeting another user, must be admin/owner/superAdmin
      if (targetUserId !== sessionUserId) {
        const isAdmin =
          session.user.orgRole === "admin" ||
          session.user.orgRole === "owner" ||
          session.user.isSuperAdmin === true;
        if (!isAdmin) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // Extract and validate profile fields
    const fields: Record<string, string | null> = {};
    for (const key of PROFILE_FIELDS) {
      if (key in body) {
        const val = body[key];
        if (val !== null && typeof val !== "string") {
          return NextResponse.json(
            { error: `Field '${key}' must be a string or null` },
            { status: 400 }
          );
        }
        fields[key] = val;
      }
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const result = updateMemberProfile(orgId, targetUserId, fields);
    if (!result) {
      return NextResponse.json(
        { error: "Member not found in organization" },
        { status: 404 }
      );
    }

    logAction("org_member", targetUserId, "updated", { fields: Object.keys(fields) }, { userId: sessionUserId, orgId });

    return NextResponse.json({ member: result });
  } catch (err: unknown) {
    console.error("Error updating member profile:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
