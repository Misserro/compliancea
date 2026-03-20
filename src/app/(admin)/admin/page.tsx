import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getAllOrganizations } from "@/lib/db-imports";
import { AdminOrgList } from "@/components/admin/admin-org-list";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

interface Org {
  id: number;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
  status: "active" | "pending_deletion" | "expired";
  daysUntilDeletion?: number;
  deletedAt?: string;
}

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/");

  await ensureDb();
  const rawOrgs = getAllOrganizations();

  const now = Date.now();
  const orgs: Org[] = rawOrgs.map((org: Record<string, unknown>) => {
    let status: "active" | "pending_deletion" | "expired" = "active";
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
      id: org.id as number,
      name: org.name as string,
      slug: org.slug as string,
      memberCount: (org.member_count as number) ?? 0,
      createdAt: org.created_at as string,
      status,
      ...(org.deleted_at
        ? { daysUntilDeletion, deletedAt: org.deleted_at as string }
        : {}),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Organizations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage all organizations across the platform.
        </p>
      </div>
      <AdminOrgList orgs={orgs} />
    </div>
  );
}
