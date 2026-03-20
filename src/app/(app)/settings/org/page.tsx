"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Users, Calendar, Shield } from "lucide-react";
import { RESOURCES, RESOURCE_LABELS, type PermissionLevel } from "@/lib/permissions";
import { PERMISSION_LEVEL_COLORS } from "@/lib/constants";

interface OrgData {
  id: number;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
}

export default function OrgSettingsPage() {
  const { data: sessionData, update: updateSession } = useSession();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Default permissions state
  const [defaults, setDefaults] = useState<Record<string, string> | null>(null);
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [savingResource, setSavingResource] = useState<string | null>(null);

  const orgRole = sessionData?.user?.orgRole;
  const canEdit = orgRole === "owner" || orgRole === "admin";

  const loadDefaults = useCallback(async () => {
    setDefaultsLoading(true);
    try {
      const res = await fetch("/api/org/permissions");
      if (res.ok) {
        const data = await res.json();
        setDefaults(data.defaults);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to load default permissions");
      }
    } catch (err) {
      toast.error(
        `Failed to load permissions: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setDefaultsLoading(false);
    }
  }, []);

  const loadOrg = useCallback(async () => {
    try {
      const res = await fetch("/api/org");
      if (res.ok) {
        const data: OrgData = await res.json();
        setOrg(data);
        setEditName(data.name);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to load organization");
      }
    } catch (err) {
      toast.error(`Failed to load organization: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  useEffect(() => {
    if (canEdit) {
      loadDefaults();
    }
  }, [canEdit, loadDefaults]);

  async function handleDefaultChange(resource: string, newLevel: string) {
    if (!defaults) return;

    const previousLevel = defaults[resource];
    // Optimistic update
    setDefaults((prev) => (prev ? { ...prev, [resource]: newLevel } : prev));
    setSavingResource(resource);

    try {
      const res = await fetch("/api/org/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: { [resource]: newLevel } }),
      });
      if (res.ok) {
        const data = await res.json();
        setDefaults(data.defaults);
        toast.success(
          `Default ${RESOURCE_LABELS[resource as keyof typeof RESOURCE_LABELS]} permission updated`
        );
      } else {
        // Revert on failure
        setDefaults((prev) =>
          prev ? { ...prev, [resource]: previousLevel } : prev
        );
        const err = await res.json();
        toast.error(err.error || "Failed to update default permission");
      }
    } catch (err) {
      // Revert on failure
      setDefaults((prev) =>
        prev ? { ...prev, [resource]: previousLevel } : prev
      );
      toast.error(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSavingResource(null);
    }
  }

  async function handleSave() {
    if (!org || !editName.trim()) return;
    if (editName.trim() === org.name) return;

    setSaving(true);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrg(data.org);
        setEditName(data.org.name);
        toast.success("Organization name updated");
        // Trigger session refresh so sidebar picks up the new name
        await updateSession();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update");
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-muted-foreground">Organization not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Organization</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your organization settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="size-4" />
            General
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Organization Name</label>
            {canEdit ? (
              <div className="flex gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={80}
                  placeholder="Organization name"
                  className="max-w-md"
                />
                <Button
                  onClick={handleSave}
                  disabled={saving || !editName.trim() || editName.trim() === org.name}
                  size="sm"
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            ) : (
              <p className="text-sm">{org.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Slug</label>
            <p className="text-sm text-muted-foreground">{org.slug}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">{org.memberCount}</span>{" "}
                {org.memberCount === 1 ? "member" : "members"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Created {formatDate(org.createdAt)}
              </span>
            </div>
          </div>

          {canEdit && (
            <div className="pt-2">
              <Badge variant="secondary" className="capitalize">
                {orgRole}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Default Member Permissions -- visible to owners and admins only */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="size-4" />
              Default Member Permissions
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Default permission levels applied to new members when they join the organization.
            </p>
          </CardHeader>
          <CardContent>
            {defaultsLoading ? (
              <div className="space-y-3">
                {RESOURCES.map((r) => (
                  <div key={r} className="flex items-center justify-between">
                    <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                    <div className="h-8 bg-muted rounded w-28 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : defaults ? (
              <div className="space-y-3">
                {RESOURCES.map((resource) => {
                  const currentLevel = defaults[resource] ?? "full";
                  return (
                    <div
                      key={resource}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-sm font-medium">
                        {RESOURCE_LABELS[resource]}
                      </span>
                      <Select
                        value={currentLevel}
                        onValueChange={(value) =>
                          handleDefaultChange(resource, value)
                        }
                        disabled={savingResource === resource}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["none", "view", "edit", "full"] as const).map(
                            (level) => (
                              <SelectItem
                                key={level}
                                value={level}
                                className="text-xs"
                              >
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${PERMISSION_LEVEL_COLORS[level] || ""}`}
                                >
                                  {level}
                                </Badge>
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
