"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, Download, FileText, Upload } from "lucide-react";
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

function formatDate(dateString: string | null): string {
  if (!dateString) return "\u2014";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function getCategoryLabel(value: string): string {
  const cat = CASE_DOCUMENT_CATEGORIES.find((c) => c.value === value);
  return cat ? cat.label : value;
}

type IndexingStatus = "processing" | "indexed" | "failed";

interface IndexingStatusEntry {
  status: IndexingStatus;
  errorMessage?: string;
}

function IndexingBadge({ entry }: { entry: IndexingStatusEntry | undefined }) {
  if (!entry) return null;
  if (entry.status === "indexed") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ml-2">
        Indexed
      </span>
    );
  }
  if (entry.status === "processing") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 ml-2 animate-pulse">
        Indexing...
      </span>
    );
  }
  // failed
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 ml-2 cursor-help"
      title={entry.errorMessage || "Indexing failed"}
    >
      Indexing failed
    </span>
  );
}

export function CaseDocumentsTab({ caseId }: CaseDocumentsTabProps) {
  const [documents, setDocuments] = useState<CaseDocumentWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [indexingStatus, setIndexingStatus] = useState<Record<number, IndexingStatusEntry>>({});
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
            toast.error(item.errorMessage || "Document indexing failed — please try re-uploading", { duration: 8000 });
          }
        } else if (prev === "processing" && item.status !== "processing") {
          // Transition detected
          if (item.status === "indexed") {
            toast.success("Document indexed and ready for chat");
          } else {
            toast.error(item.errorMessage || "Document indexing failed — please try re-uploading", { duration: 8000 });
          }
        }
        prevIndexingStatus.current[item.documentId] = item.status;
      }
      setIndexingStatus(map);
    } catch {
      // Silently skip if endpoint is unavailable
    }
  }, [caseId]);

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
        toast.success("Document removed from case");
        fetchDocuments();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to remove document");
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
        Loading documents...
      </div>
    );
  }

  return (
    <div data-slot="case-documents-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Documents</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Document
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
            All ({documents.length})
          </button>
          {CASE_DOCUMENT_CATEGORIES.filter((cat) =>
            activeCategoryValues.has(cat.value)
          ).map((cat) => {
            const count = documents.filter(
              (d) => d.document_category === cat.value
            ).length;
            const isActive = categoryFilter === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors",
                  isActive
                    ? CASE_DOCUMENT_CATEGORY_COLORS[cat.value]
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                )}
                onClick={() =>
                  setCategoryFilter(isActive ? "" : cat.value)
                }
              >
                {cat.label} ({count})
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
            No documents attached.
          </p>
          <p className="text-xs text-muted-foreground">
            Upload or link a document to get started.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Document
          </Button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No documents in this category.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => {
            const categoryColor =
              CASE_DOCUMENT_CATEGORY_COLORS[doc.document_category] ||
              CASE_DOCUMENT_CATEGORY_COLORS.other;
            const displayName =
              doc.linked_document_name || doc.file_name || "Untitled";
            const isLinked = !!doc.document_id;

            return (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded border bg-card text-sm"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <Badge className={cn(categoryColor)}>
                      {getCategoryLabel(doc.document_category)}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center">
                      {displayName}
                      {doc.document_id && (
                        <IndexingBadge entry={indexingStatus[doc.document_id]} />
                      )}
                      {doc.label && (
                        <span className="text-muted-foreground font-normal ml-2">
                          {doc.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                      <span>
                        {isLinked ? "Linked from library" : "Uploaded"}
                      </span>
                      {doc.date_filed && (
                        <span>Filed: {formatDate(doc.date_filed)}</span>
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
                    title="Download document"
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
                    title="Remove document from case"
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
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the document from this case. If it was linked from
              the document library, the original will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingDocId) {
                  handleDeleteDocument(deletingDocId);
                  setDeletingDocId(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
