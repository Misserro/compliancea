"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Shield, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORG_ROLE_COLORS } from "@/lib/constants";

interface AdminUser {
  id: number;
  name: string | null;
  email: string;
  isSuperAdmin: boolean;
  createdAt: string;
  orgs: { name: string; role: string }[];
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function AdminUserList({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [togglingId, setTogglingId] = useState<number | null>(null);

  async function handleToggleSuperAdmin(user: AdminUser) {
    setTogglingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSuperAdmin: !user.isSuperAdmin }),
      });
      if (res.ok) {
        toast.success(
          user.isSuperAdmin
            ? `Revoked super admin from ${user.name || user.email}`
            : `Granted super admin to ${user.name || user.email}`
        );
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update user");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleGrantAll() {
    try {
      const res = await fetch("/api/admin/users", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Super admin granted to all users");
        router.refresh();
      } else {
        toast.error(data.error || "Failed");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={handleGrantAll}>
          <Shield className="size-3.5 mr-1.5" />
          Grant super admin to all
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Organizations</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium text-right">Super Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium">{user.name || <span className="text-muted-foreground">(no name)</span>}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                  {user.id === currentUserId && (
                    <Badge variant="outline" className="text-xs mt-0.5">You</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.orgs.length === 0 ? (
                    <span className="text-muted-foreground text-xs">None</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {user.orgs.map((o, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className={cn("text-xs", ORG_ROLE_COLORS[o.role] || "")}
                        >
                          {o.name} · {o.role}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {user.isSuperAdmin ? (
                      <Shield className="size-3.5 text-primary" />
                    ) : (
                      <ShieldOff className="size-3.5 text-muted-foreground" />
                    )}
                    <Switch
                      checked={user.isSuperAdmin}
                      onCheckedChange={() => handleToggleSuperAdmin(user)}
                      disabled={togglingId === user.id}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
