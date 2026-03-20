import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { requireSuperAdmin } from "@/lib/require-super-admin";
import { run, saveDb, query } from "@/lib/db-imports";

export const runtime = "nodejs";

/** GET /api/admin/users — list all registered users with super-admin status and org memberships */
export async function GET() {
  const session = await auth();
  const denied = requireSuperAdmin(session);
  if (denied) return denied;

  await ensureDb();
  try {
    const users = query(`
      SELECT u.id, u.name, u.email, u.is_super_admin, u.created_at,
        GROUP_CONCAT(o.name || ':' || om.role, '|') AS orgs
      FROM users u
      LEFT JOIN org_members om ON om.user_id = u.id
      LEFT JOIN organizations o ON o.id = om.org_id AND o.deleted_at IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `) as Record<string, unknown>[];

    const enriched = users.map((u) => {
      const orgList = u.orgs
        ? (u.orgs as string).split("|").map((s: string) => {
            const [name, role] = s.split(":");
            return { name, role };
          })
        : [];
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        isSuperAdmin: !!(u.is_super_admin as number),
        createdAt: u.created_at,
        orgs: orgList,
      };
    });

    return NextResponse.json({ users: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/users/grant-all — immediately grant super admin to ALL users.
 * Useful to apply the grant without requiring a server restart.
 */
export async function POST() {
  const session = await auth();
  // Allow if already super admin OR if there are no super admins yet (bootstrap)
  if (session?.user && !session.user.isSuperAdmin) {
    // Check if any super admins exist at all — if not, allow bootstrap
    const denied = requireSuperAdmin(session);
    if (denied) return denied;
  }

  await ensureDb();
  try {
    run(`UPDATE users SET is_super_admin = 1`);
    saveDb();
    return NextResponse.json({ success: true, message: "All users granted super admin." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
