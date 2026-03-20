"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Pencil, Trash2, RotateCcw, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORG_STATUS_COLORS } from "@/lib/constants";
import { CreateOrgDialog } from "@/components/admin/create-org-dialog";

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

function statusLabel(status: string, daysUntilDeletion?: number): string {
  if (status === "active") return "Active";
  if (status === "pending_deletion") {
    return `Pending Deletion (${daysUntilDeletion ?? 0}d left)`;
  }
  return "Expired";
}

export function AdminOrgList({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  function startEdit(org: Org) {
    setEditingId(org.id);
    setEditName(org.name);
    setEditSlug(org.slug);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditSlug("");
  }

  async function handleSaveEdit(orgId: number) {
    const trimmedName = editName.trim();
    const trimmedSlug = editSlug.trim();

    if (!trimmedName) {
      toast.error("Organization name is required");
      return;
    }
    if (!trimmedSlug || !/^[a-z0-9-]+$/.test(trimmedSlug)) {
      toast.error("Slug must contain only lowercase letters, numbers, and hyphens");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, slug: trimmedSlug }),
      });
      if (res.ok) {
        toast.success("Organization updated");
        setEditingId(null);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update organization");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(orgId: number) {
    setDeletingId(orgId);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        toast.success("Organization deleted");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete organization");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRestore(orgId: number) {
    setRestoringId(orgId);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Organization restored");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to restore organization");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> Create organization
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Slug</th>
              <th className="text-left px-4 py-3 font-medium">Members</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orgs.map((org) => {
              const isEditing = editingId === org.id;

              return (
                <tr key={org.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {isEditing ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-sm"
                        disabled={saving}
                      />
                    ) : (
                      org.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {isEditing ? (
                      <Input
                        value={editSlug}
                        onChange={(e) => setEditSlug(e.target.value)}
                        className="h-8 text-sm"
                        disabled={saving}
                      />
                    ) : (
                      <code className="text-xs">{org.slug}</code>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {org.memberCount}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={cn(ORG_STATUS_COLORS[org.status] || "")}
                    >
                      {statusLabel(org.status, org.daysUntilDeletion)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(org.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSaveEdit(org.id)}
                            disabled={saving}
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : org.status === "active" ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(org)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={deletingId === org.id}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete organization</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete &quot;{org.name}&quot;?
                                  All {org.memberCount} member{org.memberCount !== 1 ? "s" : ""} will
                                  lose access immediately. Data will be permanently deleted
                                  after 30 days.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(org.id)}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      ) : org.status === "pending_deletion" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(org.id)}
                          disabled={restoringId === org.id}
                        >
                          <RotateCcw className="size-4" />
                          {restoringId === org.id ? "Restoring..." : "Restore"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {orgs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No organizations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateOrgDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
