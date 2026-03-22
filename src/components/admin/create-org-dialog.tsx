"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, X } from "lucide-react";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateOrgDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateOrgDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [warning, setWarning] = useState("");
  const [success, setSuccess] = useState(false);

  // Auto-generate slug from name (unless manually edited)
  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(generateSlug(name));
    }
  }, [name, slugManuallyEdited]);

  function resetForm() {
    setName("");
    setSlug("");
    setSlugManuallyEdited(false);
    setOwnerEmail("");
    setError("");
    setInviteUrl("");
    setWarning("");
    setSuccess(false);
    setSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  function handleSlugChange(value: string) {
    setSlugManuallyEdited(true);
    setSlug(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    const trimmedEmail = ownerEmail.trim();

    if (!trimmedName) {
      setError("Organization name is required");
      return;
    }
    if (!trimmedSlug) {
      setError("Slug is required");
      return;
    }
    if (!SLUG_PATTERN.test(trimmedSlug)) {
      setError("Slug must contain only lowercase letters, numbers, and hyphens");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        name: trimmedName,
        slug: trimmedSlug,
      };
      if (trimmedEmail) {
        body.ownerEmail = trimmedEmail;
      }

      const res = await fetch("/api/admin/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create organization");
        return;
      }

      if (data.warning) {
        setWarning(data.warning);
      }

      if (data.inviteUrl) {
        setInviteUrl(data.inviteUrl);
        toast.success("Organization created with invite link");
      } else if (data.warning) {
        // Stay in dialog to show warning — user clicks Done to close
        setSuccess(true);
        toast.success("Organization created");
      } else {
        toast.success("Organization created");
        onCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied!");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  function handleDoneWithInvite() {
    resetForm();
    onCreated();
  }

  // Show invite URL success state
  if (inviteUrl) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Organization created</DialogTitle>
            <DialogDescription>
              Share this invite link with the first owner to set up the organization.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <Input
              readOnly
              value={inviteUrl}
              className="flex-1 bg-transparent"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyInvite}
            >
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
          {warning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning}
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleDoneWithInvite}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Show success state with warning (no invite URL)
  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Organization created</DialogTitle>
            <DialogDescription>
              The organization has been created successfully.
            </DialogDescription>
          </DialogHeader>
          {warning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning}
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleDoneWithInvite}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Create a new organization. Optionally invite a first owner.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              placeholder="acme-corp"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-email">Invite first owner (optional)</Label>
            <Input
              id="owner-email"
              type="email"
              placeholder="owner@example.com"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              An invite link will be generated for this email.
            </p>
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
