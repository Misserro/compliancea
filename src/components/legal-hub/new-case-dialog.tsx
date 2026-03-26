"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { LEGAL_CASE_TYPES } from "@/lib/constants";
import type { OrgMember } from "@/lib/types";

interface NewCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function NewCaseDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewCaseDialogProps) {
  const { data: sessionData } = useSession();
  const t = useTranslations('LegalHub');
  const tCommon = useTranslations('Common');
  const tType = useTranslations('CaseTypes');
  const isAdmin = sessionData?.user?.orgRole !== "member";
  const currentUserId = sessionData?.user?.id;

  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [court, setCourt] = useState("");
  const [summary, setSummary] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && isAdmin) {
      fetch("/api/org/members")
        .then((res) => res.json())
        .then((data) => {
          if (data.members) {
            setMembers(data.members);
            if (!assignedTo && currentUserId) {
              setAssignedTo(String(currentUserId));
            }
          }
        })
        .catch(() => {});
    }
  }, [open, isAdmin, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setTitle("");
    setCaseType("");
    setReferenceNumber("");
    setCourt("");
    setSummary("");
    setAssignedTo("");
    setMembers([]);
    setError("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setError("");

    if (!title.trim()) {
      setError(t('newCaseDialog.titleRequired'));
      return;
    }
    if (!caseType) {
      setError(t('newCaseDialog.caseTypeRequired'));
      return;
    }

    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        case_type: caseType,
        reference_number: referenceNumber.trim() || null,
        court: court.trim() || null,
        summary: summary.trim() || null,
      };
      if (isAdmin && assignedTo) {
        body.assigned_to = Number(assignedTo);
      }

      const res = await fetch("/api/legal-hub/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('newCaseDialog.createError'));
        setIsSubmitting(false);
        return;
      }

      reset();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newCaseDialog.createError'));
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{t('newCaseDialog.title')}</h2>
          {!isSubmitting && (
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('newCaseDialog.titleLabel')} <span className="text-destructive">*</span></label>
            <input type="text" className="w-full px-2 py-1.5 border rounded text-sm bg-background" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('newCaseDialog.titlePlaceholder')} />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('newCaseDialog.caseTypeLabel')} <span className="text-destructive">*</span></label>
            <select className="w-full px-2 py-1.5 border rounded text-sm bg-background" value={caseType} onChange={(e) => setCaseType(e.target.value)}>
              <option value="">{t('newCaseDialog.caseTypePlaceholder')}</option>
              {LEGAL_CASE_TYPES.map((ct) => (<option key={ct} value={ct}>{tType(ct)}</option>))}
            </select>
          </div>

          {isAdmin && members.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('newCaseDialog.assignedToLabel')}</label>
              <select className="w-full px-2 py-1.5 border rounded text-sm bg-background" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                {members.map((m) => (<option key={m.user_id} value={String(m.user_id)}>{m.name || m.email}</option>))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('newCaseDialog.referenceNumberLabel')} <span className="text-muted-foreground font-normal">{t('newCaseDialog.referenceNumberOptional')}</span></label>
            <input type="text" className="w-full px-2 py-1.5 border rounded text-sm bg-background" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder={t('newCaseDialog.referenceNumberPlaceholder')} />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('newCaseDialog.courtLabel')} <span className="text-muted-foreground font-normal">{t('newCaseDialog.courtOptional')}</span></label>
            <input type="text" className="w-full px-2 py-1.5 border rounded text-sm bg-background" value={court} onChange={(e) => setCourt(e.target.value)} placeholder={t('newCaseDialog.courtPlaceholder')} />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('newCaseDialog.descriptionLabel')} <span className="text-muted-foreground font-normal">{t('newCaseDialog.descriptionOptional')}</span></label>
            <textarea className="w-full px-2 py-1.5 border rounded text-sm bg-background resize-none" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t('newCaseDialog.descriptionPlaceholder')} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={handleClose} disabled={isSubmitting} className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors">{tCommon('cancel')}</button>
            <button onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting ? t('newCaseDialog.creating') : t('newCaseDialog.createCase')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
