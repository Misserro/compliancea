import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensureDb } from "@/lib/server-utils";
import { getUsersWithSessionInfo } from "@/lib/db-imports";
import { TerminateButton } from "./_terminate-button";

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ isActive, lastSeen }: { isActive: number; lastSeen: string | null }) {
  if (!lastSeen) return <span className="text-muted-foreground text-sm">—</span>;
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-gray-400" />
      Offline
    </span>
  );
}

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  await ensureDb();
  const users = getUsersWithSessionInfo() as Array<{
    id: number;
    name: string | null;
    email: string;
    role: string;
    created_at: string;
    last_seen_at: string | null;
    is_active: number;
  }>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registered accounts and their session status.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">
                  {user.name ?? <span className="text-muted-foreground italic">—</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="capitalize">{user.role}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge isActive={user.is_active} lastSeen={user.last_seen_at} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatRelative(user.last_seen_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  {user.id !== Number(session.user.id) && user.last_seen_at !== null && (
                    <TerminateButton userId={user.id} />
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
