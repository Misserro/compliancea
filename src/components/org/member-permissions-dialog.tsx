"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw } from "lucide-react";
import { RESOURCES, RESOURCE_LABELS, type PermissionLevel } from "@/lib/permissions";
import { PERMISSION_LEVEL_COLORS } from "@/lib/constants";

interface MemberPermissionsDialogProps {
  member: {
    userId: number;
    name: string | null;
    email: string;
    role: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PERMISSION_OPTIONS: PermissionLevel[] = ["none", "view", "edit", "full"];

export function MemberPermissionsDialog({
  member,
  open,
  onOpenChange,
}: MemberPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<Record<string, string> | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [savingResource, setSavingResource] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const loadPermissions = useCallback(async () => {
    if (!member) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/org/members/${member.userId}/permissions`
      );
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to load permissions");
      }
    } catch (err) {
      toast.error(
        `Failed to load permissions: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [member]);

  useEffect(() => {
    if (open && member) {
      loadPermissions();
    }
    if (!open) {
      setPermissions(null);
    }
  }, [open, member, loadPermissions]);

  async function handlePermissionChange(
    resource: string,
    newLevel: string
  ) {
    if (!member || !permissions) return;

    const previousLevel = permissions[resource];
    // Optimistic update
    setPermissions((prev) =>
      prev ? { ...prev, [resource]: newLevel } : prev
    );
    setSavingResource(resource);

    try {
      const res = await fetch(
        `/api/org/members/${member.userId}/permissions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            permissions: { [resource]: newLevel },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions);
        toast.success(
          `${RESOURCE_LABELS[resource as keyof typeof RESOURCE_LABELS]} permission updated`
        );
      } else {
        // Revert on failure
        setPermissions((prev) =>
          prev ? { ...prev, [resource]: previousLevel } : prev
        );
        const err = await res.json();
        toast.error(err.error || "Failed to update permission");
      }
    } catch (err) {
      // Revert on failure
      setPermissions((prev) =>
        prev ? { ...prev, [resource]: previousLevel } : prev
      );
      toast.error(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSavingResource(null);
    }
  }

  async function handleReset() {
    if (!member) return;
    setResetting(true);
    try {
      const res = await fetch(
        `/api/org/members/${member.userId}/permissions/reset`,
        { method: "POST" }
      );
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions);
        toast.success("Permissions reset to organization defaults");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to reset permissions");
      }
    } catch (err) {
      toast.error(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Member Permissions</DialogTitle>
          <DialogDescription>
            Manage permissions for{" "}
            <strong>{member?.name || member?.email}</strong>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            {RESOURCES.map((r) => (
              <div key={r} className="flex items-center justify-between">
                <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                <div className="h-8 bg-muted rounded w-28 animate-pulse" />
              </div>
            ))}
          </div>
        ) : permissions ? (
          <div className="space-y-3">
            {RESOURCES.map((resource) => {
              const currentLevel = permissions[resource] ?? "full";
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
                      handlePermissionChange(resource, value)
                    }
                    disabled={savingResource === resource}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMISSION_OPTIONS.map((level) => (
                        <SelectItem key={level} value={level} className="text-xs">
                          <Badge
                            variant="outline"
                            className={`text-xs ${PERMISSION_LEVEL_COLORS[level] || ""}`}
                          >
                            {level}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}

            <div className="pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={resetting}
                className="w-full"
              >
                <RotateCcw className="size-4" />
                {resetting ? "Resetting..." : "Reset to organization defaults"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
