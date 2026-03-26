"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
import { OrgMembersPanel } from "@/components/admin/org-members-panel";
import { OrgFeatureFlags } from "@/components/admin/org-feature-flags";
import { OrgMigrationPanel } from "@/components/admin/org-migration-panel";

interface Org {
  id: number;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
  status: "active" | "pending_deletion" | "expired";
  daysUntilDeletion?: number;
  deletedAt?: string;
  storagePolicy: string;
  orgS3Configured: boolean;
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

function statusLabel(status: string, daysUntilDeletion: number | undefined, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  if (status === "active") return t("statusActive");
  if (status === "pending_deletion") {
    return t("statusPendingDeletion", { days: daysUntilDeletion ?? 0 });
  }
  return t("statusExpired");
}

export function AdminOrgList({ orgs, platformConfigured }: { orgs: Org[]; platformConfigured: boolean }) {
  const t = useTranslations("Admin.orgList");
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [updatingPolicyId, setUpdatingPolicyId] = useState<number | null>(null);

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
      toast.error(t("orgNameRequired"));
      return;
    }
    if (!trimmedSlug || !/^[a-z0-9-]+$/.test(trimmedSlug)) {
      toast.error(t("slugInvalid"));
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
        toast.success(t("orgUpdated"));
        setEditingId(null);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || t("failedToUpdateOrg"));
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
        toast.success(t("orgDeleted"));
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || t("failedToDeleteOrg"));
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
        toast.success(t("orgRestored"));
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || t("failedToRestoreOrg"));
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRestoringId(null);
    }
  }

  async function handleStoragePolicyChange(orgId: number, policy: string) {
    setUpdatingPolicyId(orgId);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_policy: policy }),
      });
      if (res.ok) {
        toast.success(t("storagePolicyUpdated"));
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || t("failedToUpdateStoragePolicy"));
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUpdatingPolicyId(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> {t("createOrganization")}
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">{t("nameHeader")}</th>
              <th className="text-left px-4 py-3 font-medium">{t("slugHeader")}</th>
              <th className="text-left px-4 py-3 font-medium">{t("membersHeader")}</th>
              <th className="text-left px-4 py-3 font-medium">{t("statusHeader")}</th>
              <th className="text-left px-4 py-3 font-medium">{t("storageHeader")}</th>
              <th className="text-left px-4 py-3 font-medium">{t("createdHeader")}</th>
              <th className="px-4 py-3 font-medium text-right">{t("actionsHeader")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orgs.map((org) => {
              const isEditing = editingId === org.id;

              return (
                <React.Fragment key={org.id}>
                <tr className="hover:bg-muted/30 transition-colors">
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
                      {statusLabel(org.status, org.daysUntilDeletion, t)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={org.storagePolicy}
                      onChange={(e) => handleStoragePolicyChange(org.id, e.target.value)}
                      disabled={updatingPolicyId === org.id || org.status !== "active"}
                    >
                      <option value="local">{t("storageLocal")}</option>
                      <option value="platform_s3">{t("storagePlatformS3")}</option>
                      <option value="own_s3">{t("storageOwnS3")}</option>
                    </select>
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
                                <AlertDialogTitle>{t("deleteOrganization")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("deleteOrgConfirm", { name: org.name, count: org.memberCount })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(org.id)}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                  {t("delete")}
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
                          {restoringId === org.id ? t("restoring") : t("restore")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {/* Members panel — expands below the row */}
                <tr>
                  <td colSpan={7} className="p-0">
                    <OrgMembersPanel orgId={org.id} orgName={org.name} />
                  </td>
                </tr>
                {/* Feature flags panel — expands below the row */}
                <tr>
                  <td colSpan={7} className="p-0">
                    <OrgFeatureFlags orgId={org.id} />
                  </td>
                </tr>
                {/* Migration panel — expands below the row */}
                <tr>
                  <td colSpan={7} className="p-0">
                    <OrgMigrationPanel
                      orgId={org.id}
                      storagePolicy={org.storagePolicy}
                      platformConfigured={platformConfigured}
                      orgS3Configured={org.orgS3Configured}
                    />
                  </td>
                </tr>
                </React.Fragment>
              );
            })}
            {orgs.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t("noOrganizations")}
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
