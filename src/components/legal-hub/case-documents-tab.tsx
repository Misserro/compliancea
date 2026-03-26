"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, Download, FileText, Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import {
  CASE_DOCUMENT_CATEGORIES,
  CASE_DOCUMENT_CATEGORY_COLORS,
} from "@/lib/constants";
import type { CaseDocument } from "@/lib/types";
import { AddCaseDocumentDialog } from "./add-case-document-dialog";

interface CaseDocumentsTabProps {
  caseId: number;
}

interface CaseDocumentWithJoins extends CaseDocument {
  linked_document_name: string | null;
  linked_document_path: string | null;
}

type IndexingStatus = "processing" | "indexed" | "failed";

interface IndexingStatusEntry {
  status: IndexingStatus;
  errorMessage?: string;
}

function IndexingBadge({ entry, t }: { entry: IndexingStatusEntry | undefined; t: ReturnType<typeof useTranslations<'LegalHub'>> }) {
  if (!entry) return null;
  if (entry.status === "indexed") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ml-2">
        {t('indexing.indexed')}
      </span>
    );
  }
  if (entry.status === "processing") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 ml-2 animate-pulse">
        {t('indexing.processing')}
      </span>
    );
  }
  // failed
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 ml-2 cursor-help"
      title={entry.errorMessage || String(t('indexing.failedTooltip'))}
    >
      {t('indexing.failed')}
    </span>
  );
}

export function CaseDocumentsTab({ caseId }: CaseDocumentsTabProps) {
  const t = useTranslations('LegalHub');
  const tCommon = useTranslations('Common');
  const tCat = useTranslations("DocCategories");
  const locale = useLocale();

  function formatDate(dateString: string | null): string {
    if (!dateString) return "\u2014";
    try {
      return new Date(dateString).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  }
  const [documents, setDocuments] = useState<CaseDocumentWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [indexingStatus, setIndexingStatus] = useState<Record<number, IndexingStatusEntry>>({});
  const [retrying, setRetrying] = useState<Record<number, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevIndexingStatus = useRef<Record<number, IndexingStatus>>({});

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/legal-hub/cases/${caseId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.case_documents || []);
      }
    } catch (err) {
      console.warn("Failed to fetch case documents:", err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const fetchIndexingStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/legal-hub/cases/${caseId}/documents/status`);
      if (!res.ok) return;
      const data: Array<{ documentId: number; status: IndexingStatus; errorMessage?: string }> = await res.json();
      const map: Record<number, IndexingStatusEntry> = {};
      for (const item of data) {
        map[item.documentId] = { status: item.status, errorMessage: item.errorMessage };
        const prev = prevIndexingStatus.current[item.documentId];
        if (prev === undefined) {
          // First time seeing this document — toast if already failed (failed before first poll)
          if (item.status === "failed") {
            toast.error(item.errorMessage || t('indexing.documentFailed'), { duration: 8000 });
          }
        } else if (prev === "processing" && item.status !== "processing") {
          // Transition detected
          if (item.status === "indexed") {
            toast.success(t('indexing.documentIndexed'));
          } else {
            toast.error(item.errorMessage || t('indexing.documentFailed'), { duration: 8000 });
          }
        }
        prevIndexingStatus.current[item.documentId] = item.status;
      }
      setIndexingStatus(map);
    } catch {
      // Silently skip if endpoint is unavailable
    }
  }, [caseId]);

  const retryIndexing = useCallback(async (caseDocId: number) => {
    setRetrying((prev) => ({ ...prev, [caseDocId]: true }));
    // Optimistically mark as processing so badge updates immediately
    prevIndexingStatus.current[caseDocId] = "processing";
    setIndexingStatus((prev) => ({ ...prev, [caseDocId]: { status: "processing" } }));
    try {
      const res = await fetch(`/api/legal-hub/cases/${caseId}/documents/${caseDocId}/reindex`, { method: "POST" });
      if (res.ok) {
        await fetchIndexingStatus();
      } else {
        toast.error(t('documents.reindexFailed'));
        setIndexingStatus((prev) => ({ ...prev, [caseDocId]: { status: "failed", errorMessage: "Reindex failed" } }));
      }
    } catch {
      toast.error(t('documents.reindexFailed'));
      setIndexingStatus((prev) => ({ ...prev, [caseDocId]: { status: "failed", errorMessage: "Reindex failed" } }));
    } finally {
      setRetrying((prev) => ({ ...prev, [caseDocId]: false }));
    }
  }, [caseId, fetchIndexingStatus]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchIndexingStatus();
  }, [fetchIndexingStatus]);

  // Poll every 5s while any document is in "processing" state
  useEffect(() => {
    const hasProcessing = Object.values(indexingStatus).some((e) => e.status === "processing");
    if (hasProcessing) {
      pollRef.current = setInterval(fetchIndexingStatus, 5000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [indexingStatus, fetchIndexingStatus]);

  const filteredDocuments = useMemo(() => {
    if (!categoryFilter) return documents;
    return documents.filter((d) => d.document_category === categoryFilter);
  }, [documents, categoryFilter]);

  // Compute which categories actually have documents
  const activeCategoryValues = useMemo(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      set.add(doc.document_category);
    }
    return set;
  }, [documents]);

  const handleDeleteDocument = async (id: number) => {
    try {
      const res = await fetch(
        `/api/legal-hub/cases/${caseId}/documents/${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success(t('documents.removed'));
        fetchDocuments();
      } else {
        const data = await res.json();
        toast.error(data.error || t('documents.removeError'));
      }
    } catch (err) {
      toast.error(
        `Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  };

  const handleSaved = () => {
    fetchDocuments();
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        {t('documents.loadingDocuments')}
      </div>
    );
  }

  return (
    <div data-slot="case-documents-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{t('documents.title')}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t('documents.addDocument')}
        </Button>
      </div>

      {/* Category filter chips */}
      {documents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            type="button"
            className={cn(
              "px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors",
              !categoryFilter
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
            )}
            onClick={() => setCategoryFilter("")}
          >
            {t('documents.all')} ({documents.length})
          </button>
          {CASE_DOCUMENT_CATEGORIES.filter((cat) =>
            activeCategoryValues.has(cat)
          ).map((cat) => {
            const count = documents.filter(
              (d) => d.document_category === cat
            ).length;
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors",
                  isActive
                    ? CASE_DOCUMENT_CATEGORY_COLORS[cat]
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                )}
                onClick={() =>
                  setCategoryFilter(isActive ? "" : cat)
                }
              >
                {tCat(cat)} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Document list or empty state */}
      {documents.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Upload className="w-10 h-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t('documents.noDocuments')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('documents.noDocumentsHint')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t('documents.addDocument')}
          </Button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t('documents.noCategoryDocuments')}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => {
            const categoryColor =
              CASE_DOCUMENT_CATEGORY_COLORS[doc.document_category] ||
              CASE_DOCUMENT_CATEGORY_COLORS.other;
            const displayName =
              doc.linked_document_name || doc.file_name || t('documents.noName');
            const isLinked = !!doc.document_id;

            return (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded border bg-card text-sm"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <Badge className={cn(categoryColor)}>
                      {tCat(doc.document_category)}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center">
                      {displayName}
                      {doc.document_id && (
                        <>
                          <IndexingBadge entry={indexingStatus[doc.document_id]} t={t} />
                          {indexingStatus[doc.document_id]?.status === "failed" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); retryIndexing(doc.id); }}
                              disabled={retrying[doc.id]}
                              className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 disabled:opacity-50 cursor-pointer"
                              title={t('documents.retryIndexing')}
                            >
                              <RefreshCw className={`h-2.5 w-2.5 ${retrying[doc.id] ? "animate-spin" : ""}`} />
                              {t('documents.retry')}
                            </button>
                          )}
                        </>
                      )}
                      {doc.label && (
                        <span className="text-muted-foreground font-normal ml-2">
                          {doc.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                      <span>
                        {isLinked ? t('documents.fromLibrary') : t('documents.uploaded')}
                      </span>
                      {doc.date_filed && (
                        <span>{t('documents.filedOn', { date: formatDate(doc.date_filed) })}</span>
                      )}
                      {doc.filing_reference && (
                        <span>Ref: {doc.filing_reference}</span>
                      )}
                      <span>{formatDate(doc.added_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Download */}
                  <a
                    href={`/api/legal-hub/cases/${caseId}/documents/${doc.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-muted transition-colors"
                    title={t('documents.downloadDocument')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isLinked ? (
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </a>

                  {/* Delete */}
                  <button
                    className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingDocId(doc.id);
                    }}
                    title={t('documents.removeFromCase')}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddCaseDocumentDialog
        caseId={caseId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={deletingDocId !== null}
        onOpenChange={(open) => !open && setDeletingDocId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingDocId) {
                  handleDeleteDocument(deletingDocId);
                  setDeletingDocId(null);
                }
              }}
            >
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
