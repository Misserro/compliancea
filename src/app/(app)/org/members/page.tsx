"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Users, UserMinus, Mail, Copy, X, Clock } from "lucide-react";
import { ORG_ROLE_COLORS } from "@/lib/constants";

interface Member {
  userId: number;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
}

interface PendingInvite {
  token: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
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

function formatRelativeExpiry(dateStr: string): string {
  try {
    const now = new Date();
    const expires = new Date(dateStr);
    const diffMs = expires.getTime() - now.getTime();

    if (diffMs <= 0) return "Expired";

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 1) return `Expires in ${diffDays} days`;
    if (diffDays === 1) return "Expires tomorrow";
    if (diffHours > 1) return `Expires in ${diffHours} hours`;
    if (diffHours === 1) return "Expires in 1 hour";
    return "Expires soon";
  } catch {
    return dateStr;
  }
}

export default function MembersPage() {
  const { data: sessionData } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Invite creation state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string } | null>(null);

  // Pending invites state
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  const orgRole = sessionData?.user?.orgRole;
  const currentUserId = Number(sessionData?.user?.id);
  const canManage = orgRole === "owner" || orgRole === "admin";

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/org/members");
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to load members");
      }
    } catch (err) {
      toast.error(`Failed to load members: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/org/invites");
      if (res.ok) {
        const data = await res.json();
        setPendingInvites(data.invites);
      }
    } catch {
      // Silently fail -- invite list is non-critical
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (canManage) {
      loadInvites();
    }
  }, [canManage, loadInvites]);

  async function handleRoleChange(userId: number, newRole: string) {
    setUpdatingId(userId);
    try {
      const res = await fetch(`/api/org/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
        );
        toast.success("Role updated");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update role");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRemove(userId: number) {
    setUpdatingId(userId);
    try {
      const res = await fetch(`/api/org/members/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        toast.success("Member removed");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to remove member");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleGenerateInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) {
      toast.error("Email is required");
      return;
    }

    setInviteLoading(true);
    setInviteResult(null);
    try {
      const res = await fetch("/api/org/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteResult({ inviteUrl: data.inviteUrl });
        setInviteEmail("");
        loadInvites();
      } else {
        toast.error(data.error || "Failed to generate invite");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleCopyLink() {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl);
      toast.success("Link copied!");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  async function handleRevokeInvite(token: string) {
    setRevokingToken(token);
    try {
      const res = await fetch(`/api/org/invites/${token}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setPendingInvites((prev) => prev.filter((inv) => inv.token !== token));
        toast.success("Invite revoked");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to revoke invite");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRevokingToken(null);
    }
  }

  function getRoleOptions(targetMember: Member): string[] {
    // Owner can set any role
    if (orgRole === "owner") {
      return ["owner", "admin", "member"];
    }
    // Admin can only change member<->admin (not set owner, not change owners)
    if (orgRole === "admin") {
      if (targetMember.role === "owner") return [];
      return ["admin", "member"];
    }
    return [];
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organization members and their roles.
        </p>
      </div>

      {members.length <= 1 && members.length > 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <Users className="size-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            You are the only member of this organization.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const roleOptions = getRoleOptions(member);
              const canChangeRole = canManage && !isSelf && roleOptions.length > 0;
              const canRemove = canManage && !isSelf;

              return (
                <tr key={member.userId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {member.name ?? (
                      <span className="text-muted-foreground italic">--</span>
                    )}
                    {isSelf && (
                      <span className="text-xs text-muted-foreground ml-2">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={ORG_ROLE_COLORS[member.role] || ""}
                    >
                      {member.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(member.joinedAt)}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canChangeRole && (
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              handleRoleChange(member.userId, value)
                            }
                            disabled={updatingId === member.userId}
                          >
                            <SelectTrigger className="w-28 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {canRemove && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={updatingId === member.userId}
                              >
                                <UserMinus className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove member</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove{" "}
                                  <strong>{member.name || member.email}</strong> from
                                  the organization? They will lose access to all
                                  organization data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemove(member.userId)}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={canManage ? 5 : 4}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite Creation Section -- visible to owners and admins only */}
      {canManage && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Invite Member</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Generate a shareable invite link for a new member.
            </p>
          </div>

          <form onSubmit={handleGenerateInvite} className="flex items-end gap-3">
            <div className="flex-1 max-w-sm">
              <Input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviteLoading}
              />
            </div>
            <Select value={inviteRole} onValueChange={setInviteRole} disabled={inviteLoading}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">member</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={inviteLoading}>
              <Mail className="size-4" />
              {inviteLoading ? "Generating..." : "Generate invite link"}
            </Button>
          </form>

          {/* Invite result block */}
          {inviteResult && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <Input
                readOnly
                value={inviteResult.inviteUrl}
                className="flex-1 bg-transparent"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
              >
                <Copy className="size-4" />
                Copy
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setInviteResult(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Pending Invites Section -- only shown when there are pending invites */}
      {canManage && pendingInvites.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Pending Invites</h2>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingInvites.map((invite) => (
                  <tr key={invite.token} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{invite.email}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={ORG_ROLE_COLORS[invite.role] || ""}
                      >
                        {invite.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatRelativeExpiry(invite.expiresAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={revokingToken === invite.token}
                          >
                            {revokingToken === invite.token ? "Revoking..." : "Revoke"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke invite</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to revoke the invite for{" "}
                              <strong>{invite.email}</strong>? The invite link will
                              become invalid immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRevokeInvite(invite.token)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
