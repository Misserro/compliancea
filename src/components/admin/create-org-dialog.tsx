"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("Admin.createOrgDialog");
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
      setError(t("orgNameRequired"));
      return;
    }
    if (!trimmedSlug) {
      setError(t("slugRequired"));
      return;
    }
    if (!SLUG_PATTERN.test(trimmedSlug)) {
      setError(t("slugInvalid"));
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
        setError(data.error || t("failedToCreate"));
        return;
      }

      if (data.warning) {
        setWarning(data.warning);
      }

      if (data.inviteUrl) {
        setInviteUrl(data.inviteUrl);
        toast.success(t("orgCreatedWithInvite"));
      } else if (data.warning) {
        // Stay in dialog to show warning — user clicks Done to close
        setSuccess(true);
        toast.success(t("orgCreated"));
      } else {
        toast.success(t("orgCreated"));
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
      toast.success(t("inviteLinkCopied"));
    } catch {
      toast.error(t("failedToCopyLink"));
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
            <DialogTitle>{t("orgCreatedTitle")}</DialogTitle>
            <DialogDescription>
              {t("orgCreatedInviteDesc")}
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
              {t("copy")}
            </Button>
          </div>
          {warning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning}
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleDoneWithInvite}>{t("done")}</Button>
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
            <DialogTitle>{t("orgCreatedTitle")}</DialogTitle>
            <DialogDescription>
              {t("orgCreatedSuccessDesc")}
            </DialogDescription>
          </DialogHeader>
          {warning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning}
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleDoneWithInvite}>{t("done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("subtitle")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">{t("orgNameLabel")}</Label>
            <Input
              id="org-name"
              placeholder={t("orgNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">{t("slugLabel")}</Label>
            <Input
              id="org-slug"
              placeholder={t("slugPlaceholder")}
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              {t("slugHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-email">{t("ownerEmailLabel")}</Label>
            <Input
              id="owner-email"
              type="email"
              placeholder={t("ownerEmailPlaceholder")}
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              {t("ownerEmailHint")}
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
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
