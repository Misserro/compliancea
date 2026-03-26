"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEPARTMENTS, DOC_TYPES, JURISDICTIONS, SENSITIVITIES } from "@/lib/constants";
import type { Document } from "@/lib/types";

interface MetadataDialogProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, metadata: Record<string, unknown>) => Promise<void>;
}

export function MetadataDialog({ document: doc, open, onOpenChange, onSave }: MetadataDialogProps) {
  const t = useTranslations('Documents');
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState("");
  const [category, setCategory] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [sensitivity, setSensitivity] = useState("");
  const [status, setStatus] = useState("");
  const [inForce, setInForce] = useState("");
  const [language, setLanguage] = useState("");
  const [client, setClient] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (doc) {
      setDocType(doc.doc_type || "");
      setCategory(doc.category || "");
      setJurisdiction(doc.jurisdiction || "");
      setSensitivity(doc.sensitivity || "");
      setStatus(doc.status || "draft");
      setInForce(doc.in_force || "unknown");
      setLanguage(doc.language || "");
      setClient(doc.client || "");
      try {
        const parsed = JSON.parse(doc.tags || "[]");
        setTags(Array.isArray(parsed) ? parsed.join(", ") : "");
      } catch {
        setTags("");
      }
    }
  }, [doc]);

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    try {
      const tagArray = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await onSave(doc.id, {
        doc_type: docType || null,
        category: category || null,
        jurisdiction: jurisdiction || null,
        sensitivity: sensitivity || null,
        status: status || "draft",
        in_force: inForce || "unknown",
        language: language || null,
        client: client || null,
        tags: JSON.stringify(tagArray),
        confirmed_tags: 1,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const summary = doc?.metadata_json ? (() => {
    try {
      return JSON.parse(doc.metadata_json).summary;
    } catch {
      return null;
    }
  })() : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('metadata.title')}</DialogTitle>
          {doc && (
            <p className="text-sm text-muted-foreground truncate">{doc.name}</p>
          )}
        </DialogHeader>

        {summary && (
          <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
            {summary}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="meta-doc-type">{t('metadata.documentType')}</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger id="meta-doc-type" className="mt-1.5">
                <SelectValue placeholder={t('metadata.unknown')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">{t('metadata.unknown')}</SelectItem>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="meta-category">{t('metadata.category')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="meta-category" className="mt-1.5">
                <SelectValue placeholder={t('metadata.unassigned')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">{t('metadata.unassigned')}</SelectItem>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="meta-jurisdiction">{t('metadata.jurisdiction')}</Label>
            <Select value={jurisdiction} onValueChange={setJurisdiction}>
              <SelectTrigger id="meta-jurisdiction" className="mt-1.5">
                <SelectValue placeholder={t('metadata.unknown')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">{t('metadata.unknown')}</SelectItem>
                {JURISDICTIONS.map((j) => (
                  <SelectItem key={j} value={j}>{j}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="meta-sensitivity">{t('metadata.sensitivity')}</Label>
            <Select value={sensitivity} onValueChange={setSensitivity}>
              <SelectTrigger id="meta-sensitivity" className="mt-1.5">
                <SelectValue placeholder={t('metadata.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {SENSITIVITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="meta-status">{t('metadata.status')}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="meta-status" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t('metadata.statusDraft')}</SelectItem>
                <SelectItem value="in_review">{t('metadata.statusInReview')}</SelectItem>
                <SelectItem value="approved">{t('metadata.statusApproved')}</SelectItem>
                <SelectItem value="archived">{t('metadata.statusArchived')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="meta-in-force">{t('metadata.enforcement')}</Label>
            <Select value={inForce} onValueChange={setInForce}>
              <SelectTrigger id="meta-in-force" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">{t('metadata.enforcementUnknown')}</SelectItem>
                <SelectItem value="in_force">{t('metadata.enforcementInForce')}</SelectItem>
                <SelectItem value="archival">{t('metadata.enforcementArchival')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="meta-language">{t('metadata.language')}</Label>
            <Input
              id="meta-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="meta-client">{t('metadata.clientCounterparty')}</Label>
            <Input
              id="meta-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="meta-tags">{t('metadata.tagsLabel')}</Label>
          <Input
            id="meta-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t('metadata.tagsPlaceholder')}
            className="mt-1.5"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('metadata.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('metadata.saving') : t('metadata.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
