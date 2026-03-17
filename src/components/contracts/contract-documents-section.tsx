"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Download, FileText } from "lucide-react";
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
import { CONTRACT_DOCUMENT_TYPE_COLORS } from "@/lib/constants";
import type { ContractDocument } from "@/lib/types";
import { AddContractDocumentDialog } from "./add-contract-document-dialog";

interface ContractDocumentsSectionProps {
  contractId: number;
  onUpdate?: () => void;
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

export function ContractDocumentsSection({ contractId, onUpdate }: ContractDocumentsSectionProps) {
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.warn("Failed to fetch contract documents:", err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDeleteDocument = async (id: number) => {
    try {
      const res = await fetch(
        `/api/contracts/${contractId}/documents/${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success("Document removed");
        fetchDocuments();
        onUpdate?.();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete document");
      }
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleSaved = () => {
    fetchDocuments();
    onUpdate?.();
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">Loading documents...</div>
    );
  }

  return (
    <div data-slot="contract-documents-section">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground">Documents</h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Document
        </Button>
      </div>

      {/* Document list */}
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents attached.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const typeColor = CONTRACT_DOCUMENT_TYPE_COLORS[doc.document_type] || CONTRACT_DOCUMENT_TYPE_COLORS.other;
            const displayName = doc.linked_document_name || doc.file_name || "Untitled";
            const isLinked = !!doc.document_id;

            return (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded border bg-card text-sm"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <Badge className={cn(typeColor)}>
                      {doc.document_type}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {displayName}
                      {doc.label && (
                        <span className="text-muted-foreground font-normal ml-2">
                          {doc.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isLinked ? "Linked from library" : "Uploaded"} · {formatDate(doc.added_at)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Download */}
                  <a
                    href={`/api/contracts/${contractId}/documents/${doc.id}/download`}
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
                    title="Remove document"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddContractDocumentDialog
        contractId={contractId}
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
              This will remove the document attachment from this contract. This action cannot be undone.
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
