"use client";

import { useState, useRef } from "react";
import { Copy, Save, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import type { CaseTemplate } from "@/lib/types";

interface TemplateFormProps {
  template?: CaseTemplate | null;
  onSaved: () => void;
  onCancel: () => void;
  initialContent?: string;
}

const VARIABLE_REFERENCE: Array<{ token: string; descKey: string }> = [
  { token: "{{today}}", descKey: "today" },
  { token: "{{case.reference_number}}", descKey: "caseReferenceNumber" },
  { token: "{{case.title}}", descKey: "caseTitle" },
  { token: "{{case.court}}", descKey: "caseCourt" },
  { token: "{{case.court_division}}", descKey: "caseCourtDivision" },
  { token: "{{case.judge}}", descKey: "caseJudge" },
  { token: "{{case.status}}", descKey: "caseStatus" },
  { token: "{{case.summary}}", descKey: "caseSummary" },
  { token: "{{case.claim_value}}", descKey: "caseClaimValue" },
  { token: "{{case.claim_currency}}", descKey: "caseClaimCurrency" },
  { token: "{{case.claim_description}}", descKey: "caseClaimDescription" },
  { token: "{{parties.plaintiff.name}}", descKey: "partiesPlaintiffName" },
  { token: "{{parties.plaintiff.address}}", descKey: "partiesPlaintiffAddress" },
  { token: "{{parties.defendant.name}}", descKey: "partiesDefendantName" },
  { token: "{{parties.defendant.address}}", descKey: "partiesDefendantAddress" },
  { token: "{{parties.representative.representative_name}}", descKey: "partiesRepresentativeName" },
  { token: "{{deadlines.next.title}}", descKey: "deadlinesNextTitle" },
  { token: "{{deadlines.next.due_date}}", descKey: "deadlinesNextDueDate" },
  { token: "{{parties.plaintiff.notes}}", descKey: "partiesPlaintiffNotes" },
  { token: "{{parties.defendant.notes}}", descKey: "partiesDefendantNotes" },
  { token: "{{parties.representative.representative_address}}", descKey: "partiesRepresentativeAddress" },
  { token: "{{case.procedure_type}}", descKey: "caseProcedureType" },
  { token: "{{case.case_type}}", descKey: "caseCaseType" },
  { token: "{{case.internal_number}}", descKey: "caseInternalNumber" },
];

export function TemplateForm({
  template,
  onSaved,
  onCancel,
  initialContent,
}: TemplateFormProps) {
  const t = useTranslations('LegalHub');
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(
    template?.description || ""
  );
  const [documentType, setDocumentType] = useState(
    template?.document_type || ""
  );
  const [templateBody, setTemplateBody] = useState(
    template?.template_body || initialContent || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // Clipboard unavailable — insert directly into editor
      editorRef.current?.insertText(token);
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('template.nameRequired'));
      return;
    }
    if (!templateBody.trim() || templateBody === "<p></p>") {
      setError(t('template.bodyRequired'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = template
        ? `/api/legal-hub/templates/${template.id}`
        : "/api/legal-hub/templates";
      const method = template ? "PATCH" : "POST";

      const body: Record<string, unknown> = {
        name: trimmedName,
        description: description.trim() || null,
        document_type: documentType.trim() || null,
        template_body: templateBody,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('template.saveError'));
      }

      onSaved();
    } catch (err) {
      console.error("Error saving template:", err);
      setError(err instanceof Error ? err.message : t('template.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form fields + editor */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold">
          {template ? t('template.editTemplate') : t('template.newTemplate')}
        </h2>

        {error && (
          <div className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">
              {t('template.nameLabel')} <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('template.namePlaceholder')}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              {t('template.descriptionLabel')}
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('template.descriptionPlaceholder')}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              {t('template.documentTypeLabel')}
            </label>
            <Input
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              placeholder={t('template.documentTypePlaceholder')}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">
              {t('template.bodyLabel')} <span className="text-destructive">*</span>
            </label>
            <RichTextEditor
              ref={editorRef}
              content={template?.template_body || initialContent || `<p>${t('template.bodyPlaceholder')}</p>`}
              onChange={setTemplateBody}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('template.bodyHint')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving
              ? (template ? t('template.saving') : t('template.creating'))
              : (template ? t('template.saveChanges') : t('template.createTemplate'))}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            {t('Common.cancel')}
          </Button>
        </div>
      </div>

      {/* Variable reference panel */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{t('template.variables')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('template.variablesHint')}
        </p>
        <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
          {VARIABLE_REFERENCE.map(({ token, descKey }) => (
            <div
              key={token}
              className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <div>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {token}
                </code>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(`variableDesc.${descKey}` as Parameters<typeof t>[0])}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(token)}
                title={t('template.copyToClipboard')}
                className="shrink-0 ml-2"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
