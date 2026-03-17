"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { FileText, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Document } from "@/lib/types";

interface CompleteObligationDialogProps {
  obligationId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

export function CompleteObligationDialog({
  obligationId,
  open,
  onOpenChange,
  onCompleted,
}: CompleteObligationDialogProps) {
  const [note, setNote] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedDocumentName, setSelectedDocumentName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);

  useEffect(() => {
    if (open) {
      setNote("");
      setSelectedDocumentId(null);
      setSelectedDocumentName(null);
      setSubmitting(false);
      setValidationError(null);
      setShowDocumentPicker(false);
      setDocuments([]);
    }
  }, [open]);

  useEffect(() => {
    if (showDocumentPicker && documents.length === 0) {
      fetch("/api/documents")
        .then((r) => r.json())
        .then((data) => {
          setDocuments(
            (data.documents || []).filter((d: Document) => d.processed)
          );
        })
        .catch(() => setDocuments([]));
    }
  }, [showDocumentPicker, documents.length]);

  async function handleSubmit() {
    if (note.trim() === "" && selectedDocumentId === null) {
      setValidationError("Please add a note or attach a document");
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/obligations/${obligationId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || undefined,
          documentId: selectedDocumentId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Obligation completed");
        onCompleted();
        onOpenChange(false);
      } else {
        toast.error(data.error || "Failed to complete obligation");
      }
    } catch {
      toast.error("Failed to complete obligation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Obligation</DialogTitle>
          <DialogDescription>
            Add a note or attach a document as proof of completion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Note textarea */}
          <div>
            <Textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="Describe how this obligation was fulfilled..."
              rows={3}
            />
          </div>

          {/* Document attachment */}
          <div>
            {selectedDocumentId ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{selectedDocumentName}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => {
                    setSelectedDocumentId(null);
                    setSelectedDocumentName(null);
                    if (validationError) setValidationError(null);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : !showDocumentPicker ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDocumentPicker(true)}
              >
                <FileText className="h-4 w-4 mr-1" />
                Attach from library
              </Button>
            ) : (
              <div className="rounded-md border">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <span className="text-xs font-medium text-muted-foreground">
                    Select a document
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setShowDocumentPicker(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <ScrollArea className="max-h-[200px]">
                  <div className="p-1">
                    {documents.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                        No processed documents available.
                      </p>
                    ) : (
                      documents.map((doc) => (
                        <button
                          key={doc.id}
                          className={cn(
                            "w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors",
                            "hover:bg-muted"
                          )}
                          onClick={() => {
                            setSelectedDocumentId(doc.id);
                            setSelectedDocumentName(doc.name);
                            setShowDocumentPicker(false);
                            if (validationError) setValidationError(null);
                          }}
                        >
                          {doc.name}
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Validation error */}
          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Completing..." : "Complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
