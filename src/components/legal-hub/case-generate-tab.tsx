"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  FileDown,
  Save,
  Loader2,
  Wand2,
  X,
  Clock,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  LegalCase,
  CaseParty,
  CaseDeadline,
  CaseTemplate,
  CaseGeneratedDoc,
} from "@/lib/types";

interface CaseGenerateTabProps {
  caseId: number;
  legalCase: LegalCase;
  parties: CaseParty[];
  deadlines: CaseDeadline[];
}

export function CaseGenerateTab({
  caseId,
  legalCase,
  parties,
  deadlines,
}: CaseGenerateTabProps) {
  const t = useTranslations('LegalHub');
  const [templates, setTemplates] = useState<CaseTemplate[]>([]);
  const [generatedDocs, setGeneratedDocs] = useState<CaseGeneratedDoc[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [documentName, setDocumentName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Editor state
  const [activeDoc, setActiveDoc] = useState<CaseGeneratedDoc | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch("/api/legal-hub/templates?isActive=1");
        if (!res.ok) throw new Error("Failed to fetch templates");
        const data = await res.json();
        setTemplates(data.templates || []);
      } catch (err) {
        console.error("Error fetching templates:", err);
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, []);

  // Fetch generated documents
  const fetchGeneratedDocs = useCallback(async () => {
    try {
      setLoadingDocs(true);
      const res = await fetch(
        `/api/legal-hub/cases/${caseId}/generated-documents`
      );
      if (!res.ok) throw new Error("Failed to fetch generated documents");
      const data = await res.json();
      setGeneratedDocs(data.generated_documents || []);
    } catch (err) {
      console.error("Error fetching generated docs:", err);
    } finally {
      setLoadingDocs(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchGeneratedDocs();
  }, [fetchGeneratedDocs]);

  // Update document name when template selection changes
  useEffect(() => {
    if (selectedTemplateId) {
      const tmpl = templates.find(
        (t) => t.id === Number(selectedTemplateId)
      );
      if (tmpl) {
        setDocumentName(tmpl.name);
      }
    }
  }, [selectedTemplateId, templates]);

  const handleGenerate = async () => {
    if (!selectedTemplateId) {
      setError(t('generate.selectTemplateError'));
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/legal-hub/cases/${caseId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_id: Number(selectedTemplateId),
            document_name: documentName.trim() || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('generate.generateError'));
      }

      const data = await res.json();
      const newDoc = data.generated_document;

      // Open in editor
      setActiveDoc(newDoc);
      setEditorContent(newDoc.generated_content);

      // Refresh the list
      await fetchGeneratedDocs();
    } catch (err) {
      console.error("Error generating document:", err);
      setError(err instanceof Error ? err.message : t('generate.generateFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenDoc = async (doc: CaseGeneratedDoc) => {
    setActiveDoc(doc);
    setEditorContent(doc.generated_content);
    setError(null);
  };

  const handleCloseEditor = () => {
    setActiveDoc(null);
    setEditorContent("");
  };

  const handleSave = async () => {
    if (!activeDoc) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/legal-hub/cases/${caseId}/generated-documents/${activeDoc.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generated_content: editorContent,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('generate.saveError'));
      }

      const data = await res.json();
      setActiveDoc(data.generated_document);
      await fetchGeneratedDocs();
    } catch (err) {
      console.error("Error saving document:", err);
      setError(err instanceof Error ? err.message : t('generate.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!activeDoc) return;

    setExporting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/legal-hub/cases/${caseId}/generated-documents/${activeDoc.id}/export`
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('generate.exportError'));
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeDoc.document_name || "document"}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting document:", err);
      setError(err instanceof Error ? err.message : t('generate.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteDoc = async (doc: CaseGeneratedDoc) => {
    if (
      !window.confirm(t('generate.deleteConfirm', { name: doc.document_name }))
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/legal-hub/cases/${caseId}/generated-documents/${doc.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('generate.deleteError'));
      }

      if (activeDoc?.id === doc.id) {
        handleCloseEditor();
      }
      await fetchGeneratedDocs();
    } catch (err) {
      console.error("Error deleting document:", err);
      alert(err instanceof Error ? err.message : t('generate.deleteError'));
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Template selector + generate */}
        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold">{t('generate.title')}</h3>

            {loadingTemplates ? (
              <Skeleton className="h-10 w-full" />
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('generate.noTemplates')}{" "}
                <a
                  href="/legal-hub/templates"
                  className="underline text-primary"
                >
                  {t('generate.templatesLink')}
                </a>
                .
              </p>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {t('generate.selectTemplate')}
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">{t('generate.selectTemplatePlaceholder')}</option>
                    {templates.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.name}
                        {tmpl.document_type ? ` (${tmpl.document_type})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {t('generate.documentName')}
                  </label>
                  <Input
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    placeholder={t('generate.documentNamePlaceholder')}
                  />
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={generating || !selectedTemplateId}
                  size="sm"
                  className="w-full"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  {generating ? t('generate.generating') : t('generate.generateDocument')}
                </Button>
              </>
            )}
          </div>

          {/* Generated documents history */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t('generate.generatedDocuments')}</h3>
            {loadingDocs ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : generatedDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('generate.noGeneratedDocs')}
              </p>
            ) : (
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {generatedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between py-2 px-1 ${
                      activeDoc?.id === doc.id ? "bg-primary/5 rounded" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {doc.document_name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {doc.template_name && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {doc.template_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(doc.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDoc(doc)}
                        className="text-xs"
                      >
                        {t('generate.openDoc')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDoc(doc)}
                        className="text-destructive hover:text-destructive text-xs"
                      >
                        {t('generate.deleteDoc')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Editor */}
        <div className="space-y-4">
          {activeDoc ? (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-muted/50 px-4 py-2 border-b">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {activeDoc.document_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('generate.editingGeneratedDoc')}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    title={t('generate.saveChanges')}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExport}
                    disabled={exporting}
                    title={t('generate.exportDocx')}
                  >
                    {exporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileDown className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCloseEditor}
                    title={t('generate.closeEditor')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <RichTextEditor
                content={editorContent}
                onChange={setEditorContent}
                minHeight="400px"
                className="border-0 rounded-none"
              />
            </div>
          ) : (
            <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
              <Wand2 className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>{t('generate.editorPlaceholder')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
