import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { AdminUserList } from "@/components/admin/admin-user-list";
import { query } from "@/lib/db-imports";

interface AdminUser {
  id: number;
  name: string | null;
  email: string;
  isSuperAdmin: boolean;
  createdAt: string;
  orgs: { name: string; role: string }[];
}

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/");

  await ensureDb();

  const rows = query(`
    SELECT u.id, u.name, u.email, u.is_super_admin, u.created_at,
      GROUP_CONCAT(o.name || ':' || om.role, '|') AS orgs
    FROM users u
    LEFT JOIN org_members om ON om.user_id = u.id
    LEFT JOIN organizations o ON o.id = om.org_id AND o.deleted_at IS NULL
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `) as Record<string, unknown>[];

  const users: AdminUser[] = rows.map((u) => ({
    id: u.id as number,
    name: u.name as string | null,
    email: u.email as string,
    isSuperAdmin: !!(u.is_super_admin as number),
    createdAt: u.created_at as string,
    orgs: u.orgs
      ? (u.orgs as string).split("|").map((s: string) => {
          const [name, role] = s.split(":");
          return { name, role };
        })
      : [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Users</h2>
        <p className="text-sm text-muted-foreground mt-1">
          All registered users across the platform.
        </p>
      </div>
      <AdminUserList users={users} currentUserId={Number(session.user.id)} />
    </div>
  );
}
