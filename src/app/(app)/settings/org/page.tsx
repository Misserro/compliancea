"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Calendar } from "lucide-react";

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

  const orgRole = sessionData?.user?.orgRole;
  const canEdit = orgRole === "owner" || orgRole === "admin";

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
    </div>
  );
}
