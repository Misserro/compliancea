"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "@/components/ui/alert-dialog";
import { UserMinus, UserPlus, Users } from "lucide-react";
import { ORG_ROLE_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface OrgMember {
  user_id: number;
  name: string | null;
  email: string;
  role: string;
  joined_at: string;
}

interface OrgMembersPanelProps {
  orgId: number;
  orgName: string;
}

export function OrgMembersPanel({ orgId, orgName }: OrgMembersPanelProps) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Add member form
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [adding, setAdding] = useState(false);

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (expanded) loadMembers();
  }, [expanded, loadMembers]);

  async function handleAddMember() {
    if (!addEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Added ${addEmail.trim()} to ${orgName}`);
        setAddEmail("");
        setAddRole("member");
        setMembers(data.members ?? []);
      } else {
        toast.error(data.error || "Failed to add member");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/members/${removeTarget.user_id}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        toast.success(`Removed ${removeTarget.name || removeTarget.email} from ${orgName}`);
        setMembers((prev) => prev.filter((m) => m.user_id !== removeTarget.user_id));
        setRemoveTarget(null);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to remove member");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="border-t bg-muted/20">
      <button
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Users className="size-3.5" />
        {expanded ? "Hide members" : `Manage members`}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Add member */}
          <div className="flex gap-2">
            <Input
              placeholder="user@example.com"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
              className="h-8 text-sm"
              disabled={adding}
            />
            <Select value={addRole} onValueChange={setAddRole} disabled={adding}>
              <SelectTrigger className="h-8 w-28 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddMember}
              disabled={adding || !addEmail.trim()}
            >
              <UserPlus className="size-3.5" />
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>

          {/* Members list */}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="rounded-md border divide-y text-sm">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate">{m.name || m.email}</span>
                    {m.name && (
                      <span className="ml-1 text-muted-foreground text-xs truncate">
                        {m.email}
                      </span>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-xs", ORG_ROLE_COLORS[m.role] || "")}
                  >
                    {m.role}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                    onClick={() => setRemoveTarget(m)}
                  >
                    <UserMinus className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Remove confirmation */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{removeTarget?.name || removeTarget?.email}</strong> from{" "}
              <strong>{orgName}</strong>? Their access will end on the next request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={removing}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
